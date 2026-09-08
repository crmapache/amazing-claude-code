package io.github.crmapache.amazingclaudecode.scenario

import kotlin.test.Test
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/**
 * The fence around the head of a run.
 *
 * The head is told in words that it does not write to the disk, and words alone hold until four in the
 * morning, when the quickest way to satisfy a definition of done is to write the file itself. This is
 * what makes it a rule.
 */
class HeadFenceTest {

    private fun allowed(command: String) = HeadFence.judgeCommand(command).ok

    @Test
    fun `looking at the project is what the head is for`() {
        assertTrue(allowed("ls -la src"))
        assertTrue(allowed("git status"))
        assertTrue(allowed("git diff --stat"))
        assertTrue(allowed("rg TODO src"))
        assertTrue(allowed("cat package.json"))
    }

    // Deliberately generous: "run the tests and tell me whether that card was honest" is the head's job,
    // and a fence that refused it would push the checking into the cards, where nobody is watching.
    @Test
    fun `running the project's own checks is allowed`() {
        assertTrue(allowed("pnpm vitest run"))
        assertTrue(allowed("./gradlew test"))
        assertTrue(allowed("npx tsc --noEmit"))
    }

    @Test
    fun `writing to the disk is a card's job`() {
        assertFalse(allowed("rm -rf build"))
        assertFalse(allowed("git commit -m fix"))
        assertFalse(allowed("git checkout main"))
        assertFalse(allowed("npm install"))
        assertFalse(allowed("sed -i s/a/b/ file.txt"))
    }

    // Each link of a chain is judged on its own: `ls && rm -rf .` begins with an allowed word.
    @Test
    fun `a chain is judged link by link`() {
        assertFalse(allowed("ls && rm -rf ."))
        assertFalse(allowed("git status; git commit -m x"))
        assertFalse(allowed("cat a | tee b && rm a"))
        assertTrue(allowed("git status && ls src"))
    }

    // A single ampersand joins two commands as surely as the rest: it puts the first in the background
    // and runs the second. Held apart from `&&` here, because a regex that reads one as two empty links
    // would judge nothing at all and say yes.
    @Test
    fun `a command put in the background is still a chain`() {
        assertFalse(allowed("ls & rm -rf ."))
        assertFalse(allowed("git status & npm install"))
        assertTrue(allowed("git status & ls src"))
        assertTrue(allowed("git status && ls src"))
    }

    // A redirection is a write whatever the first word is, and a substitution is a command nobody judged.
    @Test
    fun `the shell's own ways of writing are refused whatever the first word is`() {
        assertFalse(allowed("echo x > file"))
        assertFalse(allowed("cat a >> b"))
        assertFalse(allowed("ls \$(rm -rf .)"))
    }

    @Test
    fun `a program nobody put on the list is refused rather than guessed at`() {
        assertFalse(allowed("mkfs"))
        assertFalse(allowed("./deploy.sh"))
        assertFalse(allowed(""))
    }

    // The path in front of a program does not change what the program is.
    @Test
    fun `a full path is judged by the program at the end of it`() {
        assertTrue(allowed("/usr/bin/git status"))
        assertFalse(allowed("/usr/bin/git push"))
    }

    // A program whose whole purpose is to write, or to run something the fence cannot see, is not on the
    // list at all: judging `xargs rm` by its first word calls a deletion a reading.
    @Test
    fun `a program that exists in order to write is not on the list`() {
        assertFalse(allowed("cat a | tee out.txt"))
        assertFalse(allowed("find . -name '*.kt' | xargs rm"))
        assertFalse(allowed("wget https://example.com/x.tgz"))
    }

    // Not the second word: both of these put the flag further along, where a check on the second word alone
    // reads them as harmless.
    @Test
    fun `a writing flag counts wherever in the command it stands`() {
        assertFalse(allowed("sed -n -i s/a/b/ file.txt"))
        assertFalse(allowed("sed -i.bak s/a/b/ file.txt"))
        assertFalse(allowed("sed --in-place s/a/b/ file.txt"))
        assertFalse(allowed("find . -name '*.kt' -delete"))
        assertFalse(allowed("find src -type f -exec rm {} ;"))
        assertFalse(allowed("yq -i .a=1 config.yml"))
        assertFalse(allowed("curl -o out.json https://example.com"))
        assertFalse(allowed("curl https://example.com --output out.json"))
    }

    // Reading with the same programs is the head's job and stays allowed.
    @Test
    fun `the reading half of those programs is untouched`() {
        assertTrue(allowed("sed -n 5,20p src/App.tsx"))
        assertTrue(allowed("find . -name '*.kt' -type f"))
        assertTrue(allowed("curl -s https://example.com"))
        assertTrue(allowed("yq .version config.yml"))
    }

    /*
     * An interpreter is on the list to run the project's own checks. Both ways of handing it a program of
     * one's own are refused: the code in a flag, and no program at all - which means the code is coming
     * down the pipe, and `echo 'code' | node` is a write in which every word is allowed.
     */
    @Test
    fun `an interpreter may run the project but not a program of the head's own`() {
        assertFalse(allowed("node -e \"require('fs').writeFileSync('x','y')\""))
        assertFalse(allowed("node --eval 1"))
        assertFalse(allowed("python3 -c \"open('x','w').write('y')\""))
        assertFalse(allowed("ruby -e puts"))
        assertFalse(allowed("php -r phpinfo();"))
        assertFalse(allowed("echo 'code' | node"))
        assertFalse(allowed("cat script.py | python3 -"))

        assertTrue(allowed("node scripts/composer-input.mjs"))
        assertTrue(allowed("python3 -m pytest tests"))
        assertTrue(allowed("node --version"))
    }

    // awk's one door out of reading text is system(); its other way of writing is a redirection, which is
    // refused whatever the first word is.
    @Test
    fun `awk may read text and may not run commands`() {
        assertFalse(allowed("awk 'BEGIN{system(\"rm -rf build\")}'"))
        assertTrue(allowed("awk '{print \$1}' file.txt"))
    }

    /*
     * The subcommand is not the second word. Every one of these is a refused change wearing an option in
     * front of it, and a fence that reads `words[1]` calls all of them harmless.
     */
    @Test
    fun `an option in front of a subcommand does not hide it`() {
        assertFalse(allowed("git -C /tmp/repo commit -m x"))
        assertFalse(allowed("git -c user.name=nobody push"))
        assertFalse(allowed("git --git-dir=/tmp/repo/.git push origin main"))
        assertFalse(allowed("git --no-pager checkout main"))
        assertFalse(allowed("npm --prefix /tmp install lodash"))
        assertFalse(allowed("pnpm -C packages/web add react"))
        assertFalse(allowed("docker -H unix:///var/run/docker.sock run alpine"))
        assertFalse(allowed("kubectl -n default delete pod x"))
        assertFalse(allowed("poetry -C /tmp add httpx"))
    }

    /*
     * The same list read backwards: a value swallowed by its option is not a subcommand. Standing in a
     * directory called `commit` is not a reason to refuse `git status`.
     */
    @Test
    fun `a value is not mistaken for a subcommand`() {
        assertTrue(allowed("git -C commit status"))
        assertTrue(allowed("git -C /tmp/repo log --oneline"))
        assertTrue(allowed("npm --prefix /tmp run test"))
        assertTrue(allowed("kubectl -n add get pods"))
        assertTrue(allowed("git grep push src"))
    }

    // An interpreter pointed at a module is that module: the module's own rules apply to what follows.
    @Test
    fun `an interpreter running a module is judged as that module`() {
        assertFalse(allowed("python3 -m pip install requests"))
        assertFalse(allowed("python -m pip uninstall requests"))

        assertTrue(allowed("python3 -m pytest tests"))
        assertTrue(allowed("python3 -m pip list"))
    }

    // The same rule the package managers already had, applied to the rest of them.
    @Test
    fun `installing dependencies is a change to the project`() {
        assertFalse(allowed("pip install requests"))
        assertFalse(allowed("uv sync"))
        assertFalse(allowed("poetry add httpx"))
        assertFalse(allowed("cargo install ripgrep"))
        assertFalse(allowed("go get example.com/x"))
        assertTrue(allowed("cargo test"))
        assertTrue(allowed("go test ./..."))
        assertTrue(allowed("pip list"))
    }
}
