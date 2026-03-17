import './sidebar.css'
import { CiSettings } from "react-icons/ci";
import { RiFocus3Line } from "react-icons/ri";
import { FaTasks } from "react-icons/fa";

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
        id: 'settings',
        label: 'Settings',
        icon: (
            <CiSettings />
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
