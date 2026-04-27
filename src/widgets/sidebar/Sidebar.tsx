import './sidebar.css'

import { RiFocus3Line } from "react-icons/ri";
import { FaTasks } from "react-icons/fa";
import { FaChartPie } from "react-icons/fa";

export type WidgetId = 'tasks' | 'focus' | 'screen_time'

const items = [
    {
        id: 'tasks',
        label: 'Tasks',
        icon: (
            <FaTasks />
        ),
    },
    {
        id: 'focus',
        label: 'Focus',
        icon: (
            <RiFocus3Line />
        ),
    },
    {
        id: 'screen_time',
        label: 'Screen Time',
        icon: (
            <FaChartPie />
        ),
    },
]

type SidebarProps = {
    selectedId: WidgetId
    onSelect: (id: WidgetId) => void
}

export default function Sidebar({ selectedId, onSelect }: SidebarProps) {
    return (
        <aside className="sidebar-shell" aria-label="Sidebar shortcuts">
            <div className="sidebar-tube">
                {items.map((item) => (
                    <button
                        key={item.id}
                        type="button"
                        className={`sidebar-item ${selectedId === item.id ? 'is-active' : ''}`}
                        onClick={() => onSelect(item.id as WidgetId)}
                        aria-pressed={selectedId === item.id}
                    >
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
