import { useState } from 'react'
import './todo.css'

type Todo = {
    id: number
    text: string
    done: boolean
}

export default function TodoList() {
    const [input, setInput] = useState('')
    const [todos, setTodos] = useState<Todo[]>([])
    const doneCount = todos.filter((todo) => todo.done).length

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
                <div className="todo-stats" aria-live="polite">
                    <span className="todo-pill">{todos.length} total</span>
                    <span className="todo-pill">{doneCount} done</span>
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