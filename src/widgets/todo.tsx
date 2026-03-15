import { useEffect, useState } from 'react'
import './todo.css'
import '../App.css'

type Todo = {
    id: number
    text: string
    done: boolean
    recurringOrigin?: {
        recurringId: number
        occurrenceDate: string
    }
}

type RecurringMode = 'daily' | 'date'

type RecurringTask = {
    id: number
    text: string
    mode: RecurringMode
    date?: string
}

const TODO_STORAGE_KEY = 'kosmos.todos'
const RECURRING_STORAGE_KEY = 'kosmos.recurring-tasks'

function getTodayKey(): string {
    const now = new Date()
    const year = now.getFullYear()
    const month = String(now.getMonth() + 1).padStart(2, '0')
    const day = String(now.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
}

function createId(): number {
    return Date.now() + Math.floor(Math.random() * 10000)
}

function isTodoArray(value: unknown): value is Todo[] {
    if (!Array.isArray(value)) return false
    return value.every((item) => {
        if (typeof item !== 'object' || item === null) return false
        const maybeTodo = item as {
            id?: unknown
            text?: unknown
            done?: unknown
            recurringOrigin?: unknown
        }
        const hasCoreFields = (
            typeof maybeTodo.id === 'number' &&
            typeof maybeTodo.text === 'string' &&
            typeof maybeTodo.done === 'boolean'
        )

        if (!hasCoreFields) return false
        if (typeof maybeTodo.recurringOrigin === 'undefined') return true
        if (typeof maybeTodo.recurringOrigin !== 'object' || maybeTodo.recurringOrigin === null) {
            return false
        }

        const recurringOrigin = maybeTodo.recurringOrigin as {
            recurringId?: unknown
            occurrenceDate?: unknown
        }

        return (
            typeof recurringOrigin.recurringId === 'number' &&
            typeof recurringOrigin.occurrenceDate === 'string'
        )
    })
}

function isRecurringTaskArray(value: unknown): value is RecurringTask[] {
    if (!Array.isArray(value)) return false

    return value.every((item) => {
        if (typeof item !== 'object' || item === null) return false

        const maybeTask = item as {
            id?: unknown
            text?: unknown
            mode?: unknown
            date?: unknown
        }

        const hasCoreFields =
            typeof maybeTask.id === 'number' &&
            typeof maybeTask.text === 'string' &&
            (maybeTask.mode === 'daily' || maybeTask.mode === 'date')

        if (!hasCoreFields) return false

        if (maybeTask.mode === 'date') {
            return typeof maybeTask.date === 'string'
        }

        return typeof maybeTask.date === 'undefined'
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

function loadRecurringTasksFromStorage(): RecurringTask[] {
    try {
        const raw = window.localStorage.getItem(RECURRING_STORAGE_KEY)
        if (!raw) return []
        const parsed: unknown = JSON.parse(raw)
        return isRecurringTaskArray(parsed) ? parsed : []
    } catch {
        return []
    }
}

export default function TodoList() {
    const [input, setInput] = useState('')
    const [todos, setTodos] = useState<Todo[]>(loadTodosFromStorage)
    const [recurringTasks, setRecurringTasks] = useState<RecurringTask[]>(loadRecurringTasksFromStorage)
    const [isRecurringModalOpen, setIsRecurringModalOpen] = useState(false)
    const [editingRecurringId, setEditingRecurringId] = useState<number | null>(null)
    const [recurringText, setRecurringText] = useState('')
    const [recurringMode, setRecurringMode] = useState<RecurringMode>('daily')
    const [recurringDate, setRecurringDate] = useState(getTodayKey())
    const doneCount = todos.filter((todo) => todo.done).length

    useEffect(() => {
        try {
            window.localStorage.setItem(TODO_STORAGE_KEY, JSON.stringify(todos))
        } catch {

        }
    }, [todos])

    useEffect(() => {
        try {
            window.localStorage.setItem(RECURRING_STORAGE_KEY, JSON.stringify(recurringTasks))
        } catch {

        }
    }, [recurringTasks])

    useEffect(() => {
        const today = getTodayKey()

        setTodos((previousTodos) => {
            let didAdd = false
            let nextTodos = previousTodos

            recurringTasks.forEach((task) => {
                const dueDate = task.mode === 'daily' ? today : task.date
                if (!dueDate || dueDate !== today) return

                const alreadyExists = nextTodos.some(
                    (todo) =>
                        todo.recurringOrigin?.recurringId === task.id &&
                        todo.recurringOrigin.occurrenceDate === today
                )

                if (alreadyExists) return

                if (nextTodos === previousTodos) {
                    nextTodos = [...previousTodos]
                }

                nextTodos.push({
                    id: createId(),
                    text: task.text,
                    done: false,
                    recurringOrigin: {
                        recurringId: task.id,
                        occurrenceDate: today,
                    },
                })
                didAdd = true
            })

            return didAdd ? nextTodos : previousTodos
        })
    }, [recurringTasks])

    function addTodo() {
        const text = input.trim()
        if (!text) return

        setTodos((prev) => [
            ...prev,
            { id: createId(), text, done: false },
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

    function openCreateRecurringModal() {
        setEditingRecurringId(null)
        setRecurringText('')
        setRecurringMode('daily')
        setRecurringDate(getTodayKey())
        setIsRecurringModalOpen(true)
    }

    function openEditRecurringModal(task: RecurringTask) {
        setEditingRecurringId(task.id)
        setRecurringText(task.text)
        setRecurringMode(task.mode)
        setRecurringDate(task.date ?? getTodayKey())
        setIsRecurringModalOpen(true)
    }

    function closeRecurringModal() {
        setIsRecurringModalOpen(false)
    }

    function removeRecurringTask(id: number) {
        setRecurringTasks((prev) => prev.filter((task) => task.id !== id))
        if (editingRecurringId === id) {
            closeRecurringModal()
        }
    }

    function submitRecurringTask(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault()
        const text = recurringText.trim()
        if (!text) return
        if (recurringMode === 'date' && !recurringDate) return

        const nextTask: RecurringTask = {
            id: editingRecurringId ?? createId(),
            text,
            mode: recurringMode,
            ...(recurringMode === 'date' ? { date: recurringDate } : {}),
        }

        setRecurringTasks((prev) => {
            if (editingRecurringId === null) {
                return [...prev, nextTask]
            }

            return prev.map((task) => (task.id === editingRecurringId ? nextTask : task))
        })

        closeRecurringModal()
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

            <section className="recurring-section" aria-label="Recurring tasks">
                <div className="rowstart recurring-header">
                    <h3>Recurring tasks</h3>
                    <button
                        type="button"
                        className="secondary recurring-add-button"
                        onClick={openCreateRecurringModal}
                    >
                        Add recurring
                    </button>
                </div>

                <ul className="recurring-list">
                    {recurringTasks.length === 0 && (
                        <li className="todo-empty">No recurring tasks yet.</li>
                    )}

                    {recurringTasks.map((task) => (
                        <li key={task.id} className="todo-item recurring-item">
                            <div className="recurring-body">
                                <span className="todo-text">{task.text}</span>
                                <span className="todo-pill recurring-pill">
                                    {task.mode === 'daily' ? 'Daily' : `On ${task.date}`}
                                </span>
                            </div>

                            <div className="recurring-actions">
                                <button
                                    type="button"
                                    className="secondary"
                                    onClick={() => openEditRecurringModal(task)}
                                >
                                    Edit
                                </button>
                                <button
                                    type="button"
                                    className="danger"
                                    onClick={() => removeRecurringTask(task.id)}
                                >
                                    Delete
                                </button>
                            </div>
                        </li>
                    ))}
                </ul>
            </section>

            {isRecurringModalOpen && (
                <div
                    className="todo-modal-backdrop"
                    role="presentation"
                    onClick={closeRecurringModal}
                >
                    <div
                        className="todo-modal"
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="recurring-modal-title"
                        onClick={(event) => event.stopPropagation()}
                    >
                        <h3 id="recurring-modal-title">
                            {editingRecurringId === null ? 'Add recurring task' : 'Edit recurring task'}
                        </h3>

                        <form className="recurring-form" onSubmit={submitRecurringTask}>
                            <label>
                                Task name
                                <input
                                    value={recurringText}
                                    onChange={(event) => setRecurringText(event.target.value)}
                                    placeholder="Read 10 pages"
                                    aria-label="Recurring task name"
                                    required
                                />
                            </label>

                            <label>
                                Repeat
                                <select
                                    value={recurringMode}
                                    onChange={(event) => setRecurringMode(event.target.value as RecurringMode)}
                                    aria-label="Recurring rule"
                                >
                                    <option value="daily">Daily</option>
                                    <option value="date">Specific date</option>
                                </select>
                            </label>

                            <label>
                                Date
                                <input
                                    type="date"
                                    value={recurringDate}
                                    onChange={(event) => setRecurringDate(event.target.value)}
                                    disabled={recurringMode !== 'date'}
                                    required={recurringMode === 'date'}
                                    aria-label="Recurring date"
                                />
                            </label>

                            <div className="recurring-form-actions">
                                <button type="button" className="secondary" onClick={closeRecurringModal}>
                                    Cancel
                                </button>
                                <button type="submit">
                                    {editingRecurringId === null ? 'Create' : 'Save changes'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </section>
    )
}
