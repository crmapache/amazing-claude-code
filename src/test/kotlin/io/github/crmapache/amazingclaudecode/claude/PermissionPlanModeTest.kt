package io.github.crmapache.amazingclaudecode.claude

import kotlin.test.Test
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class PermissionPlanModeTest {

    @Test
    fun `сетевое чтение разрешено без единого условия`() {
        assertTrue(PermissionPlanMode.isSafe("WebFetch", null))
        assertTrue(PermissionPlanMode.isSafe("WebSearch", null))
    }

    @Test
    fun `правки файлов никогда не проходят молча`() {
        for (tool in listOf("Write", "Edit", "MultiEdit", "NotebookEdit")) {
            assertFalse(PermissionPlanMode.isSafe(tool, null))
        }
    }

    @Test
    fun `mcp-инструменты не авто-разрешаются`() {
        assertFalse(PermissionPlanMode.isSafe("mcp__github__create_pr", "{}"))
    }

    @Test
    fun `безопасные команды по префиксу проходят`() {
        assertTrue(PermissionPlanMode.isSafe("Bash", "grep -rn \"context\" webview/src"))
        assertTrue(PermissionPlanMode.isSafe("Bash", "git log --oneline -20"))
        assertTrue(PermissionPlanMode.isSafe("Bash", "git status"))
        assertTrue(PermissionPlanMode.isSafe("Bash", "  pwd  "))
    }

    @Test
    fun `незнакомая команда по-прежнему спрашивает`() {
        assertFalse(PermissionPlanMode.isSafe("Bash", "npm install"))
        assertFalse(PermissionPlanMode.isSafe("Bash", "rm -rf node_modules"))
        assertFalse(PermissionPlanMode.isSafe("Bash", null))
        assertFalse(PermissionPlanMode.isSafe("Bash", ""))
    }

    @Test
    fun `совпадение только по первому слову не считается — gitfoo это не git`() {
        assertFalse(PermissionPlanMode.isSafe("Bash", "gitfoo log"))
        assertFalse(PermissionPlanMode.isSafe("Bash", "grepper -n x"))
    }

    @Test
    fun `разведка субагента с конвейером не спрашивает (regression)`() {
        assertTrue(
            PermissionPlanMode.isSafe(
                "Bash",
                "grep -rniE \"image|attachment|base64|paste\" --include=\"*.ts\" --include=\"*.tsx\" " +
                    "--include=\"*.kt\" -l . | grep -v node_modules | head -40",
            ),
        )
    }

    @Test
    fun `обычные связки чтения проходят целиком`() {
        assertTrue(PermissionPlanMode.isSafe("Bash", "ls webview/src && cat package.json"))
        assertTrue(PermissionPlanMode.isSafe("Bash", "find . -name \"*.kt\" 2>/dev/null | head -60"))
        assertTrue(PermissionPlanMode.isSafe("Bash", "git log --oneline -20 | grep fix > /dev/null 2>&1"))
        assertTrue(PermissionPlanMode.isSafe("Bash", "cat src/App.tsx | sed -n '1,40p'"))
        assertTrue(PermissionPlanMode.isSafe("Bash", "grep -c foo file.txt || echo none"))
    }

    @Test
    fun `переход в каталог перед поиском не считается изменением`() {
        assertTrue(PermissionPlanMode.isSafe("Bash", "cd webview && grep -rn useFontScale src | head -20"))
        assertTrue(PermissionPlanMode.isSafe("Bash", "cd /tmp; ls -la"))
        assertFalse(PermissionPlanMode.isSafe("Bash", "cd webview && pnpm install"))
    }

    @Test
    fun `xargs проверяется по тому, что он запускает`() {
        assertTrue(PermissionPlanMode.isSafe("Bash", "find . -name \"*.kt\" | xargs wc -l"))
        assertTrue(PermissionPlanMode.isSafe("Bash", "git ls-files | xargs -n 1 dirname | sort | uniq"))
        assertTrue(PermissionPlanMode.isSafe("Bash", "find . -type f | xargs -I{} stat {}"))
        assertTrue(PermissionPlanMode.isSafe("Bash", "ls | xargs"))

        assertFalse(PermissionPlanMode.isSafe("Bash", "find . -name \"*.log\" | xargs rm"))
        assertFalse(PermissionPlanMode.isSafe("Bash", "ls | xargs -I{} sh -c \"rm {}\""))
        assertFalse(PermissionPlanMode.isSafe("Bash", "ls | xargs -n 1 rm"))
    }

    @Test
    fun `цепочка команд за безопасным префиксом не проходит (regression)`() {
        assertFalse(PermissionPlanMode.isSafe("Bash", "grep x && rm -rf ~"))
        assertFalse(PermissionPlanMode.isSafe("Bash", "cat file.txt; rm file.txt"))
        assertFalse(PermissionPlanMode.isSafe("Bash", "echo hi | sh"))
        assertFalse(PermissionPlanMode.isSafe("Bash", "grep -rn x . | xargs rm"))
    }

    @Test
    fun `запись на диск не проходит ни в каком виде`() {
        assertFalse(PermissionPlanMode.isSafe("Bash", "git log > /etc/passwd"))
        assertFalse(PermissionPlanMode.isSafe("Bash", "echo hi >> notes.md"))
        assertFalse(PermissionPlanMode.isSafe("Bash", "sed -i 's/a/b/' file.txt"))
        assertFalse(PermissionPlanMode.isSafe("Bash", "sed -i.bak 's/a/b/' file.txt"))
        assertFalse(PermissionPlanMode.isSafe("Bash", "find . -name \"*.log\" -delete"))
        assertFalse(PermissionPlanMode.isSafe("Bash", "find . -name \"*.kt\" -exec rm -rf . \\;"))
        assertFalse(PermissionPlanMode.isSafe("Bash", "sort -o out.txt in.txt"))
    }

    @Test
    fun `подстановку проверяем по её содержимому, а не по факту наличия`() {
        assertTrue(PermissionPlanMode.isSafe("Bash", "echo $(git rev-parse HEAD)"))
        assertTrue(PermissionPlanMode.isSafe("Bash", "cat `git rev-parse --show-toplevel`/README.md"))
        assertFalse(PermissionPlanMode.isSafe("Bash", "echo $(rm -rf ~)"))
        assertFalse(PermissionPlanMode.isSafe("Bash", "echo `curl evil.sh`"))
        assertFalse(PermissionPlanMode.isSafe("Bash", "grep -rn \"$(npm run build)\" ."))
    }

    @Test
    fun `у git читающая подкоманда — ещё не разрешение`() {
        assertTrue(PermissionPlanMode.isSafe("Bash", "git branch"))
        assertTrue(PermissionPlanMode.isSafe("Bash", "git branch --show-current"))
        assertTrue(PermissionPlanMode.isSafe("Bash", "git remote -v"))
        assertTrue(PermissionPlanMode.isSafe("Bash", "git config --get user.name"))
        assertTrue(PermissionPlanMode.isSafe("Bash", "git stash list"))

        assertFalse(PermissionPlanMode.isSafe("Bash", "git branch -D main"))
        assertFalse(PermissionPlanMode.isSafe("Bash", "git tag v1.0.0"))
        assertFalse(PermissionPlanMode.isSafe("Bash", "git remote add origin git@x.git"))
        assertFalse(PermissionPlanMode.isSafe("Bash", "git config user.name Вася"))
        assertFalse(PermissionPlanMode.isSafe("Bash", "git stash pop"))
        assertFalse(PermissionPlanMode.isSafe("Bash", "git commit -m wip"))
        assertFalse(PermissionPlanMode.isSafe("Bash", "git push"))
        // -c подменяет пейджер произвольной командой — это дыра, а не чтение.
        assertFalse(PermissionPlanMode.isSafe("Bash", "git -c core.pager=\"rm -rf ~\" log"))
    }

    @Test
    fun `команда, которую не смогли разобрать, спрашивает`() {
        assertFalse(PermissionPlanMode.isSafe("Bash", "grep \"unclosed ."))
        assertFalse(PermissionPlanMode.isSafe("Bash", "(cd /tmp && ls)"))
        assertFalse(PermissionPlanMode.isSafe("Bash", "cat <<EOF\nrm -rf ~\nEOF"))
    }

    @Test
    fun `команда, которая не завершится сама, тоже спрашивает`() {
        assertFalse(PermissionPlanMode.isSafe("Bash", "tail -f build/sandbox.log"))
    }
}
