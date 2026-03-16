import './sidebar.css'

const items = [
    {
        id: 'tasks',
        label: 'Tasks',
        icon: (
            <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M9 6h10" />
                <path d="M9 12h10" />
                <path d="M9 18h10" />
                <path d="M4 6h.01" />
                <path d="M4 12h.01" />
                <path d="M4 18h.01" />
            </svg>
        ),
    },
    {
        id: 'focus',
        label: 'Focus',
        icon: (
            <svg viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="12" cy="12" r="3" />
                <path d="M12 3v3" />
                <path d="M12 18v3" />
                <path d="M3 12h3" />
                <path d="M18 12h3" />
            </svg>
        ),
    },
    {
        id: 'settings',
        label: 'Settings',
        icon: (
            <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 3v3" />
                <path d="M12 18v3" />
                <path d="M4.5 7.5l2.2 2.2" />
                <path d="M17.3 17.3l2.2 2.2" />
                <path d="M3 12h3" />
                <path d="M18 12h3" />
                <path d="M4.5 16.5l2.2-2.2" />
                <path d="M17.3 6.7l2.2-2.2" />
                <circle cx="12" cy="12" r="3.2" />
            </svg>
        ),
    },
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
