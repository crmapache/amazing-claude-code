package io.github.crmapache.amazingclaudecode.editor

import com.intellij.testFramework.fixtures.BasePlatformTestCase

/**
 * Ссылка на кусок файла должна совпадать с тем, что пользователь видит в строке
 * состояния редактора. Отсюда единица в отсчёте и отдельный случай для выделения,
 * захватившего перевод строки.
 */
class SelectionReferenceTest : BasePlatformTestCase() {

    fun testWholeLinesDropColumns() {
        val reference = referenceFor("one\ntwo\nthree\n", start = 0, end = 8)

        assertEquals(1, reference.startLine)
        // Тройной клик забирает перевод строки: считать его началом следующей
        // строки нельзя, иначе диапазон уезжает на строку вперёд.
        assertEquals(2, reference.endLine)
        assertTrue(reference.wholeLines)
    }

    fun testPartOfSingleLineKeepsColumns() {
        val reference = referenceFor("hello world\n", start = 6, end = 11)

        assertEquals(1, reference.startLine)
        assertEquals(1, reference.endLine)
        assertEquals(7, reference.startColumn)
        assertEquals(12, reference.endColumn)
        assertFalse(reference.wholeLines)
    }

    fun testNoSelectionPointsAtCaretLine() {
        myFixture.configureByText("sample.txt", "one\ntwo\nthree\n")
        myFixture.editor.caretModel.moveToOffset(5)

        val reference = SelectionReference.of(project, myFixture.editor, myFixture.file.virtualFile)

        assertEquals(2, reference.startLine)
        assertEquals(2, reference.endLine)
        assertTrue(reference.wholeLines)
    }

    private fun referenceFor(text: String, start: Int, end: Int): SelectionReference {
        myFixture.configureByText("sample.txt", text)
        myFixture.editor.selectionModel.setSelection(start, end)

        return SelectionReference.of(project, myFixture.editor, myFixture.file.virtualFile)
    }
}
