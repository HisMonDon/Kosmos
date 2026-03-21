import { useEffect, useState } from 'react'
import './todo.css'

type Todo = {
    id: number
    text: string
    done: boolean
    recurringOrigin?: {
        recurringId: number
        occurrenceDate: string
    }
}

type RecurringMode = 'daily' | 'weekly'

type RecurringTask = {
    id: number
    text: string
    mode: RecurringMode
    weekday?: number
}

const TODO_STORAGE_KEY = 'kosmos.todos'
const RECURRING_STORAGE_KEY = 'kosmos.recurring-tasks'
const DEFAULT_WEEKDAY = 0

function getTodayKey(): string {
    const now = new Date()
    const year = now.getFullYear()
    const month = String(now.getMonth() + 1).padStart(2, '0')
    const day = String(now.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
}

function getWeekdayLabel(weekday: number): string {
    return ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][weekday] ?? 'Unknown day'
}

function getWeeklyLabel(weekday: number): string {
    return `Weekly on ${getWeekdayLabel(weekday)}`
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
            weekday?: unknown
            date?: unknown
        }

        const hasCoreFields =
            typeof maybeTask.id === 'number' &&
            typeof maybeTask.text === 'string' &&
            (maybeTask.mode === 'daily' || maybeTask.mode === 'weekly' || maybeTask.mode === 'date')

        if (!hasCoreFields) return false

        if (maybeTask.mode === 'weekly') {
            return typeof maybeTask.weekday === 'number'
        }

        if (maybeTask.mode === 'date') {
            return typeof maybeTask.date === 'string'
        }

        return typeof maybeTask.weekday === 'undefined' && typeof maybeTask.date === 'undefined'
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
        if (!isRecurringTaskArray(parsed)) return []

        return parsed.map((task) => {
            if ('date' in task && typeof task.date === 'string') {
                const parsedDate = new Date(task.date)
                return {
                    id: task.id,
                    text: task.text,
                    mode: 'weekly',
                    weekday: Number.isNaN(parsedDate.getTime()) ? DEFAULT_WEEKDAY : parsedDate.getDay(),
                }
            }

            return task
        })
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
    const [recurringWeekday, setRecurringWeekday] = useState(DEFAULT_WEEKDAY)
    const doneCount = todos.filter((todo) => todo.done).length

    useEffect(() => {
        try {
            window.localStorage.setItem(TODO_STORAGE_KEY, JSON.stringify(todos))
        } catch {
            //
        }
    }, [todos])

    useEffect(() => {
        try {
            window.localStorage.setItem(RECURRING_STORAGE_KEY, JSON.stringify(recurringTasks))
        } catch {
            //
        }
    }, [recurringTasks])

    useEffect(() => {
        const today = getTodayKey()
        const todayWeekday = new Date().getDay()

        setTodos((previousTodos) => {
            let didAdd = false
            let nextTodos = previousTodos

            recurringTasks.forEach((task) => {
                const isDueToday =
                    task.mode === 'daily' ||
                    (task.mode === 'weekly' && task.weekday === todayWeekday)

                if (!isDueToday) return

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
        setRecurringWeekday(DEFAULT_WEEKDAY)
        setIsRecurringModalOpen(true)
    }

    function openEditRecurringModal(task: RecurringTask) {
        setEditingRecurringId(task.id)
        setRecurringText(task.text)
        setRecurringMode(task.mode)
        setRecurringWeekday(task.weekday ?? DEFAULT_WEEKDAY)
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

        const nextTask: RecurringTask = {
            id: editingRecurringId ?? createId(),
            text,
            mode: recurringMode,
            ...(recurringMode === 'weekly' ? { weekday: recurringWeekday } : {}),
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
        <div className="todo-container">
            <header className="todo-header" style={{ paddingTop: '10px' }}>
                <h1>Tasks</h1>
                <div className="todo-stats">
                    <div className="stat-item">
                        <span className="stat-label">Total</span>
                        <span className="stat-value">{todos.length}</span>
                    </div>
                    <div className="stat-item">
                        <span className="stat-label">Done</span>
                        <span className="stat-value">{doneCount}</span>
                    </div>
                </div>
            </header>

            <form className="todo-input-form" onSubmit={onSubmit}>
                <input
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="Add a new task..."
                    aria-label="New todo"
                />
                <button type="submit" className="btn-add">
                    <span>+</span>
                </button>
            </form>

            <div className="todo-section">
                <ul className="todo-list">
                    {todos.length === 0 ? (
                        <li className="empty-state">
                            <p>No tasks yet</p>
                            <p className="empty-hint">Add one to get started</p>
                        </li>
                    ) : (
                        todos.map((todo) => (
                            <li key={todo.id} className={`todo-item ${todo.done ? 'done' : ''}`}>
                                <input
                                    type="checkbox"
                                    checked={todo.done}
                                    onChange={() => toggleTodo(todo.id)}
                                    aria-label={`Mark ${todo.text} as done`}
                                    className="todo-checkbox"
                                />
                                <span className="todo-text">{todo.text}</span>
                                <button
                                    type="button"
                                    className="btn-delete"
                                    onClick={() => removeTodo(todo.id)}
                                    aria-label="Delete task"
                                >
                                    ×
                                </button>
                            </li>
                        ))
                    )}
                </ul>
            </div>

            <div className="recurring-section">
                <div className="recurring-header">
                    <h2>Recurring</h2>
                    <button
                        type="button"
                        className="btn-add-recurring"
                        onClick={openCreateRecurringModal}
                    >
                        Add
                    </button>
                </div>

                <ul className="recurring-list">
                    {recurringTasks.length === 0 ? (
                        <li className="empty-state">
                            <p>No recurring tasks</p>
                        </li>
                    ) : (
                        recurringTasks.map((task) => (
                            <li key={task.id} className="recurring-item">
                                <div className="recurring-info">
                                    <span className="recurring-text">{task.text}</span>
                                    <span className="recurring-badge">
                                        {task.mode === 'daily'
                                            ? 'Daily'
                                            : getWeeklyLabel(task.weekday ?? DEFAULT_WEEKDAY)}
                                    </span>
                                </div>
                                <div className="recurring-actions">
                                    <button
                                        type="button"
                                        className="btn-edit"
                                        onClick={() => openEditRecurringModal(task)}
                                        aria-label="Edit recurring task"
                                    >
                                        ✎
                                    </button>
                                    <button
                                        type="button"
                                        className="btn-delete"
                                        onClick={() => removeRecurringTask(task.id)}
                                        aria-label="Delete recurring task"
                                    >
                                        ×
                                    </button>
                                </div>
                            </li>
                        ))
                    )}
                </ul>
            </div>

            {isRecurringModalOpen && (
                <div className="modal-overlay" onClick={closeRecurringModal}>
                    <div className="modal" onClick={(e) => e.stopPropagation()}>
                        <h2 className="modal-title">
                            {editingRecurringId === null ? 'Add Recurring Task' : 'Edit Recurring Task'}
                        </h2>

                        <form className="modal-form" onSubmit={submitRecurringTask}>
                            <div className="form-group">
                                <label htmlFor="task-name">Task name</label>
                                <input
                                    id="task-name"
                                    type="text"
                                    value={recurringText}
                                    onChange={(e) => setRecurringText(e.target.value)}
                                    placeholder="e.g., Read 10 pages"
                                    aria-label="Recurring task name"
                                    required
                                />
                            </div>

                            <div className="form-group">
                                <label htmlFor="repeat-mode">Repeat</label>
                                <select
                                    id="repeat-mode"
                                    value={recurringMode}
                                    onChange={(e) => setRecurringMode(e.target.value as RecurringMode)}
                                    aria-label="Recurring rule"
                                >
                                    <option value="daily">Every day</option>
                                    <option value="weekly">
                                        {`Weekly`}
                                    </option>
                                </select>
                            </div>

                            {recurringMode === 'weekly' && (
                                <div className="form-group">
                                    <label htmlFor="repeat-day">Repeats on</label>
                                    <select
                                        id="repeat-day"
                                        value={recurringWeekday}
                                        onChange={(e) => setRecurringWeekday(Number(e.target.value))}
                                        aria-label="Recurring weekday"
                                    >
                                        {[0, 1, 2, 3, 4, 5, 6].map((weekday) => (
                                            <option key={weekday} value={weekday}>
                                                {getWeekdayLabel(weekday)}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            )}

                            <div className="modal-actions">
                                <button
                                    type="button"
                                    className="btn-cancel"
                                    onClick={closeRecurringModal}
                                >
                                    Cancel
                                </button>
                                <button type="submit" className="btn-save">
                                    {editingRecurringId === null ? 'Create' : 'Save'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    )
}
