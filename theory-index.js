// LocalStorage keys
const STORAGE_KEYS = {
    PROGRESSION_DETAILS: 'progressionDetails'
};

// Load and display all theories
function loadTheories() {
    const progressionDetails = JSON.parse(localStorage.getItem(STORAGE_KEYS.PROGRESSION_DETAILS)) || {};
    const theoryList = document.getElementById('theoryList');
    
    // Filter entries that have theory content
    const theoriesWithContent = Object.entries(progressionDetails)
        .filter(([key, data]) => {
            const theoryData = typeof data === 'string' ? { theory: data, music: '' } : data;
            return theoryData.theory && theoryData.theory.trim() !== '';
        })
        .map(([key, data]) => {
            const theoryData = typeof data === 'string' ? { theory: data, music: '' } : data;
            return { key, ...theoryData };
        });
    
    if (theoriesWithContent.length === 0) {
        theoryList.innerHTML = '<p style="color: #888; text-align: center; margin-top: 40px;">No theories yet. Add content in Chord Progression to see them here.</p>';
        return;
    }
    
    let html = '';
    theoriesWithContent.forEach(item => {
        // Escape and parse the theory content
        const lines = item.theory.split('\n').filter(l => l.trim());
        const firstLine = lines[0] || 'Untitled';
        
        html += `
            <div class="theory-card">
                <div class="theory-card-title">${escapeHtml(firstLine)}</div>
                <div class="theory-card-content">
        `;
        
        lines.slice(0, 3).forEach(line => {
            const escapedLine = escapeHtml(line);
            const styledLine = escapedLine.replace(/\*\*(.*?)\*\*/g, '<span class="bullet-dot">●</span> <span class="styled-text">$1</span>');
            html += `<p class="theory-card-line">${styledLine}</p>`;
        });
        
        if (lines.length > 3) {
            html += `<p style="color: #888; font-size: 0.9em; margin-top: 10px;">... and ${lines.length - 3} more line(s)</p>`;
        }
        
        html += `
                </div>
                <div class="theory-card-footer">
                    <a href="progression-info.html?lineTitle=${encodeURIComponent(item.key)}" class="theory-card-link">View Full →</a>
                </div>
            </div>
        `;
    });
    
    theoryList.innerHTML = html;
}

// Helper function to prevent HTML injection
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Load theories when page starts
window.addEventListener('DOMContentLoaded', () => {
    loadTheories();
});
