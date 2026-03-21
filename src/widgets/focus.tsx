import './widgetPanel.css'

export default function FocusWidget() {
    return (
        <section className="widget-panel" aria-labelledby="focus-title">
            <div className="focus-header-row">
                <h1 id="focus-title">Focus</h1>
                <button className="focus-header-button" type="button">button</button>
            </div>
            <p>Track your deep-work rhythm and maintain distraction-free blocks.</p>
            <div className="panel-stat-grid" aria-label="Focus metrics">
                <article className="panel-stat">
                    <span className="panel-stat-label">Session</span>
                    <span className="panel-stat-value">25m</span>
                </article>
                <article className="panel-stat">
                    <span className="panel-stat-label">Break</span>
                    <span className="panel-stat-value">5m</span>
                </article>
                <article className="panel-stat">
                    <span className="panel-stat-label">Streak</span>
                    <span className="panel-stat-value">4</span>
                </article>
            </div>
        </section>
    )
}
