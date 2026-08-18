package io.github.crmapache.amazingclaudecode.claude

import kotlin.test.Test
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/**
 * По итогу хода оболочка гасит работу в панели (см. ClaudeSession.onTurnEnded).
 * Ошибка в обе стороны заметна пользователю сразу: пропущенный итог оставляет
 * «Claude is thinking» с бегущим счётчиком навсегда, а лишний гасит работу
 * посреди хода.
 */
class AgentStreamTest {

    @Test
    fun `итог хода узнаётся`() {
        val line = """{"is_error":false,"num_turns":2,"subtype":"success","result":"готово","type":"result"}"""
        assertTrue(AgentStream.isTurnResult(line))
    }

    @Test
    fun `обычные события итогом не считаются`() {
        assertFalse(AgentStream.isTurnResult("""{"type":"assistant","message":{"content":[]}}"""))
        assertFalse(AgentStream.isTurnResult("""{"type":"system","subtype":"init"}"""))
    }

    /**
     * Разговор о самом протоколе — обычное дело в этой панели: агент показывает
     * пример потокового события прямо в ответе. Принять его за конец хода значит
     * погасить работу на полуслове.
     */
    @Test
    fun `пример события внутри ответа агента итогом не считается`() {
        val line = """{"type":"assistant","message":{"content":[{"type":"text","text":"CLI пришлёт {\"type\":\"result\"} в конце"}]}}"""
        assertFalse(AgentStream.isTurnResult(line))
    }

    /** Тот же текст, но пришедший результатом инструмента: cat транскрипта, grep по логу. */
    @Test
    fun `результат инструмента с текстом события итогом не считается`() {
        val line = """{"type":"user","message":{"content":[{"type":"tool_result","content":"{\"type\":\"result\",\"subtype\":\"success\"}"}]}}"""
        assertFalse(AgentStream.isTurnResult(line))
    }

    /** Оборванная строка не должна ни считаться итогом, ни ронять разбор потока. */
    @Test
    fun `битую строку переживает молча`() {
        assertFalse(AgentStream.isTurnResult("""{"type":"result","result":"обрыв"""))
    }
}
