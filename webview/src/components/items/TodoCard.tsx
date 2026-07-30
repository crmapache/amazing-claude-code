import type { TodoItem, TodoState } from '../../feed/types'
import s from '../feed.module.css'

interface TodoCardProps {
  item: TodoItem
  /** Локальные отметки поверх присланных агентом: галочку можно снять руками. */
  overrides: Record<string, TodoState>
  onToggle: (todoId: string, next: TodoState) => void
}

export const TodoCard = ({ item, overrides, onToggle }: TodoCardProps) => {
  const todos = item.todos.map((todo) => ({ ...todo, state: overrides[todo.id] ?? todo.state }))
  const done = todos.filter((todo) => todo.state === 'done').length

  return (
    <div className={s.todo}>
      <div className={s.todoHead}>
        <span className={s.label}>TASK LIST</span>
        <div className={s.spacer} />
        <span className={s.todoProgress}>
          {done} / {todos.length} done
        </span>
      </div>

      <div className={s.todoList}>
        {todos.map((todo) => (
          <button
            key={todo.id}
            type="button"
            className={s.todoRow}
            onClick={() => onToggle(todo.id, todo.state === 'done' ? 'todo' : 'done')}
          >
            <span
              className={`${s.todoBox} ${todo.state === 'done' ? s.todoBoxDone : ''} ${
                todo.state === 'active' ? s.todoBoxActive : ''
              }`}
            >
              {todo.state === 'done' ? '✓' : ''}
            </span>
            <span
              className={`${s.todoText} ${todo.state === 'done' ? s.todoTextDone : ''} ${
                todo.state === 'active' ? s.todoTextActive : ''
              }`}
            >
              {todo.text}
            </span>
            {todo.state === 'active' ? <span className={s.todoRunning}>RUNNING</span> : null}
          </button>
        ))}
      </div>
    </div>
  )
}
