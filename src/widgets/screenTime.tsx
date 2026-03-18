import './widgetPanel.css'

export default function ScreenTimeWidget() {
    return (
        <section className="widget-panel" aria-labelledby="screen-time-title">
            <h1 id="screen-time-title">Screen Time</h1>
            <p>Get a quick overview of daily usage and where your attention went.</p>
            <div className="panel-stat-grid" aria-label="Screen time metrics">
                <article className="panel-stat">
                    <span className="panel-stat-label">Today</span>
                    <span className="panel-stat-value">3h 42m</span>
                </article>
                <article className="panel-stat">
                    <span className="panel-stat-label">Productive</span>
                    <span className="panel-stat-value">72%</span>
                </article>
                <article className="panel-stat">
                    <span className="panel-stat-label">Limit Left</span>
                    <span className="panel-stat-value">1h 18m</span>
                </article>
            </div>
        </section>
    )
}
