import './sidebar.css'

const items = [
    { id: 'tasks', icon: 'T', label: 'Tasks' },
    { id: 'focus', icon: 'F', label: 'Focus' },
    { id: 'settings', icon: 'S', label: 'Settings' },
]

export default function Sidebar() {
    return (
        <aside className="sidebar-shell" aria-label="Sidebar shortcuts">
            <div className="sidebar-tube">
                {items.map((item) => (
                    <button key={item.id} type="button" className="sidebar-item">
                        <span className="sidebar-icon" aria-hidden="true">
                            {item.icon}
                        </span>
                        <span className="sidebar-label">{item.label}</span>
                    </button>
                ))}
            </div>
        </aside>
    )
}
