import { useEffect, useState } from 'react'
import './todo.css'
import './App.css'
type Todo = {
    id: number
    text: string
    done: boolean
}

const TODO_STORAGE_KEY = 'kosmos.todos'

function isTodoArray(value: unknown): value is Todo[] {
    if (!Array.isArray(value)) return false
    return value.every((item) => {
        if (typeof item !== 'object' || item === null) return false
        const maybeTodo = item as { id?: unknown; text?: unknown; done?: unknown }
        return (
            typeof maybeTodo.id === 'number' &&
            typeof maybeTodo.text === 'string' &&
            typeof maybeTodo.done === 'boolean'
        )
    })
}

function loadTodosFromStorage(): Todo[] {
    try {
        const raw = window.localStorage.getItem(TODO_STORAGE_KEY)
        if (!raw) return []
        const parsed: unknown = JSON.parse(raw)
        return isTodoArray(parsed) ? parsed : []
    } catch {
        return []
    }
}

export default function TodoList() {
    const [input, setInput] = useState('')
    const [todos, setTodos] = useState<Todo[]>(loadTodosFromStorage)
    const doneCount = todos.filter((todo) => todo.done).length

    useEffect(() => {
        try {
            window.localStorage.setItem(TODO_STORAGE_KEY, JSON.stringify(todos))
        } catch {

        }
    }, [todos])

    function addTodo() {
        const text = input.trim()
        if (!text) return

        setTodos((prev) => [
            ...prev,
            { id: Date.now(), text, done: false },
        ])
        setInput('')
    }

    function toggleTodo(id: number) {
        setTodos((prev) =>
            prev.map((t) => (t.id === id ? { ...t, done: !t.done } : t))
        )
    }

    function removeTodo(id: number) {
        setTodos((prev) => prev.filter((t) => t.id !== id))
    }

    function onSubmit(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault()
        addTodo()
    }

    return (
        <section className="todo-card" aria-label="Todo List">
            <header className="todo-header">
                <h2>Todo List</h2>
                <div className="rowstart">
                    <div className="todo-stats" aria-live="polite">
                        <span className="todo-pill">{todos.length} total</span>
                        <span className="todo-pill">{doneCount} done</span>
                    </div>
                    <button type="submit">Add</button>
                </div>
            </header>

            <form className="todo-form" onSubmit={onSubmit}>
                <input
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="Add a task"
                    aria-label="New todo"
                />
                <button type="submit">Add</button>
            </form>

            <ul className="todo-list">
                {todos.length === 0 && (
                    <li className="todo-empty">No tasks yet. Add your first one.</li>
                )}
                {todos.map((todo) => (
                    <li key={todo.id} className="todo-item">
                        <input
                            type="checkbox"
                            checked={todo.done}
                            onChange={() => toggleTodo(todo.id)}
                            aria-label={`Mark ${todo.text} as done`}
                        />
                        <span className={todo.done ? 'todo-text done' : 'todo-text'}>
                            {todo.text}
                        </span>
                        <button type="button" className="danger" onClick={() => removeTodo(todo.id)}>
                            Delete
                        </button>
                    </li>
                ))}
            </ul>
        </section>
    )
}