package io.github.crmapache.amazingclaudecode.editor

import com.intellij.testFramework.fixtures.BasePlatformTestCase

/**
 * A reference to a piece of a file has to match what the user sees in the editor's status bar. Hence
 * counting from one, and a separate case for a selection that swallowed a newline.
 */
class SelectionReferenceTest : BasePlatformTestCase() {

    fun testWholeLinesDropColumns() {
        val reference = referenceFor("one\ntwo\nthree\n", start = 0, end = 8)

        assertEquals(1, reference.startLine)
        // A triple click takes the newline with it: counting that as the start of the next line is not
        // an option, or the range slides a line forward.
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
