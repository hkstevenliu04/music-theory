// Get progression info data from DataService
let progressionInfoData = {};

async function loadProgressionInfo() {
    progressionInfoData = await DataService.getProgressionInfo();
    return progressionInfoData;
}

// Initialize on load
loadProgressionInfo();

// Helper: Convert chord array to progression ID
// [["6m"], ["4"], ["5"], ["1"]] → "6m-4-5-1"
// [["6m", "4", "5"], ["1"], ["5/7"], ["1"]] → "6m,4,5-1-5/7-1"
function chordsToProgressionId(chords) {
    if (!Array.isArray(chords)) return '';
    
    // Handle nested arrays (bar format)
    if (Array.isArray(chords[0])) {
        return chords.map(bar => 
            Array.isArray(bar) ? bar.join(',') : bar
        ).join('-');
    }
    
    // Backward compatibility: simple array
    return chords.join('-');
}

// Check owner mode
function isOwnerMode() {
    return EDIT_UI_ENABLED;
}

// Event delegation for edit button - only ONE listener at document level
document.addEventListener('click', (e) => {
    if (e.target.closest('.edit-icon[data-action="edit"]') && !isEditingDetail) {
        startDetailEdit();
    }
}, true); // Use capture phase to catch before other handlers

// Helper function to prevent HTML injection
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Helper function to add tooltips based on "Word\n< Info >\nDefinition" pattern
function addTooltipsToContent(text) {
    // Find patterns like "Word\n< Info >\nDefinition"
    // and wrap Word with tooltip
    const lines = text.split('\n');
    let result = [];
    
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();
        
        // Check if next line is "< Info >"
        if (i + 1 < lines.length && lines[i + 1].trim() === '< Info >') {
            // Check if there's a definition line after
            if (i + 2 < lines.length) {
                const definition = lines[i + 2].trim();
                if (definition && definition !== '< Info >' && definition !== '') {
                    // Wrap this word with tooltip
                    result.push(`<span class="tooltip-word" title="${escapeHtml(definition)}">${escapeHtml(trimmed)}</span>`);
                    i += 2; // Skip the "< Info >" and definition lines
                    continue;
                }
            }
        }
        
        result.push(escapeHtml(line));
    }
    
    return result.join('\n');
}

// Store current progression ID and title for editing
let currentProgId = null;
let currentLineTitle = null;
let currentUniqueKey = null;

// Helper to get the visible detail content element
function getVisibleDetailContent() {
    const progressionInfoPage = document.getElementById('progressionInfoPage');
    if (!progressionInfoPage) {
        return null;
    }
    if (progressionInfoPage.style.display === 'none') {
        return null;
    }
    
    const detailContent = progressionInfoPage.querySelector('#detailContent');
    if (!detailContent) {
        console.warn('detailContent element not found');
        return null;
    }
    return detailContent;
}

// Start editing detail
// Guard to prevent multiple edit windows opening
let isEditingDetail = false;

function startDetailEdit() {
    if (!isOwnerMode() || isEditingDetail) return;
    isEditingDetail = true;
    
    // Add a small delay to prevent rapid double-clicks from causing issues
    setTimeout(async () => {
        const progressionInfo = await DataService.getProgressionInfo();
        
        // Try multiple key formats to find the data (same logic as loadDetailView)
        let detailData = null;
        let keyToUse = null;
        
        if (currentUniqueKey && progressionInfo[currentUniqueKey]) {
            detailData = progressionInfo[currentUniqueKey];
            keyToUse = currentUniqueKey;
        }
        else if (currentLineTitle && progressionInfo[currentLineTitle]) {
            detailData = progressionInfo[currentLineTitle];
            keyToUse = currentLineTitle;
        }
        else if (currentLineTitle) {
            const matchingKey = Object.keys(progressionInfo).find(key => 
                key.includes(currentLineTitle) || currentLineTitle.includes(key.split('ㅤㅤ')[0])
            );
            if (matchingKey) {
                detailData = progressionInfo[matchingKey];
                keyToUse = matchingKey;
            }
        }
        
        if (!detailData) {
            detailData = { theory: '', music: [] };
            keyToUse = currentUniqueKey || currentLineTitle;
        }
        
        // Find the VISIBLE progressionInfoPage and its detailContent
        const progressionInfoPage = document.getElementById('progressionInfoPage');
        if (!progressionInfoPage || progressionInfoPage.style.display === 'none') {
            isEditingDetail = false;
            return;
        }
        
        const detailContent = progressionInfoPage.querySelector('#detailContent');
        if (!detailContent) {
            isEditingDetail = false;
            return;
        }
        
        detailContent.innerHTML = '';
        
        const musicJson = JSON.stringify(detailData.music || [], null, 2);
        
        detailContent.innerHTML = `
            <div class="detail-box">
                <div class="detail-edit-form">
                    <div class="progression-edit-row">
                        <label>Theory:</label>
                        <textarea class="detail-edit-theory" name="theory" id="detail-edit-theory" style="min-height: 150px;">${escapeHtml(detailData.theory || '')}</textarea>
                    </div>
                    <div class="progression-edit-row">
                        <label>Music Examples (JSON):</label>
                        <textarea class="detail-edit-music" name="music" id="detail-edit-music" style="min-height: 200px; font-family: monospace;">${escapeHtml(musicJson)}</textarea>
                        <small style="color: #666; margin-top: 4px; display: block;">Format: [{"title": "Song", "artist": "Artist", "part": "verse", "genre": "rock"}]</small>
                    </div>
                    <div class="detail-edit-controls">
                        <button class="detail-save-btn" id="detailSaveBtn">Save</button>
                        <button class="detail-cancel-btn" id="detailCancelBtn">Cancel</button>
                        <button class="detail-delete-btn" id="detailDeleteBtn">Delete</button>
                    </div>
                </div>
            </div>
        `;
        
        // Add event listeners for edit buttons (CSP-compliant)
        setTimeout(() => {
            document.getElementById('detailSaveBtn')?.addEventListener('click', saveDetailEdit);
            document.getElementById('detailCancelBtn')?.addEventListener('click', cancelDetailEdit);
            document.getElementById('detailDeleteBtn')?.addEventListener('click', deleteDetailProgression);
        }, 0);
    }, 0);
}

// Save detail edit
async function saveDetailEdit() {
    const theory = document.querySelector('.detail-edit-theory').value.trim();
    const musicText = document.querySelector('.detail-edit-music').value.trim();
    
    // Parse music JSON
    let music = [];
    if (musicText) {
        try {
            music = JSON.parse(musicText);
            if (!Array.isArray(music)) {
                alert('Music must be an array of objects. Example: [{"title": "Song", "artist": "Artist", "part": "verse", "genre": "rock"}]');
                return;
            }
        } catch (error) {
            alert('Invalid JSON format for music. Please check your syntax.');
            return;
        }
    }
    
    // Validate: at least one field must have content
    if (!theory && music.length === 0) {
        alert('Please enter content in at least one section (Theory or Music Examples).');
        return;
    }
    
    const progressionInfo = await DataService.getProgressionInfo();
    const keyToSave = currentUniqueKey || currentLineTitle;
    progressionInfo[keyToSave] = { theory, music };
    
    // Note: In a real app, you would save this to server
    // For now, it updates the in-memory cache
    console.log('Saved progression info:', keyToSave, progressionInfo[keyToSave]);
    
    isEditingDetail = false;
    loadDetailView();
}

// Cancel detail edit
function cancelDetailEdit() {
    isEditingDetail = false;
    loadDetailView();
}

// Delete progression detail
async function deleteDetailProgression() {
    if (!isOwnerMode()) return;
    
    if (confirm('Are you sure you want to delete this detail content?')) {
        const progressionInfo = await DataService.getProgressionInfo();
        const keyToDelete = currentUniqueKey || currentLineTitle;
        delete progressionInfo[keyToDelete];
        
        // Note: In a real app, you would delete this from server
        // For now, it updates the in-memory cache
        console.log('Deleted progression info:', keyToDelete);
        
        isEditingDetail = false;
        loadDetailView();
    }
}

// Load and display progression detail
function loadDetailView() {
    // Update the header title with the clicked line
    const titleToShow = currentLineTitle || 'Unknown';
    
    // Update page title directly
    const pageTitleEl = document.getElementById('pageTitle');
    if (pageTitleEl) {
        pageTitleEl.textContent = escapeHtml(titleToShow);
    }
    
    // Show edit button only in owner mode
    const controlsDiv = document.getElementById('detailControls');
    if (controlsDiv) {
        controlsDiv.style.display = 'none';
        controlsDiv.innerHTML = ''; // Clear first
    }
    
    // Use DataService to get progression info
    DataService.getProgressionInfo()
        .then(progressionInfo => {
            let detailData = { theory: '', music: [] };
            
            // Try to find data by unique key or title
            const keyToLoad = currentUniqueKey || currentLineTitle;
            
            if (progressionInfo[keyToLoad]) {
                detailData = progressionInfo[keyToLoad];
            } else {
                // Try fuzzy match
                const matchingKey = Object.keys(progressionInfo).find(key => 
                    key.includes(currentLineTitle) || currentLineTitle.includes(key)
                );
                if (matchingKey) {
                    detailData = progressionInfo[matchingKey];
                }
            }
            
            renderDetailView(detailData);
        })
        .catch(error => {
            console.error('Failed to load progressionInfo.json:', error);
            renderDetailView({ theory: '', music: [] });
        });
}

function renderDetailView(detailData) {
    
    let theoryHtml = '';
    let musicHtml = '';
    
    // Process theory section with tooltip support
    let processedTheory = detailData.theory ? addTooltipsToContent(detailData.theory) : '';
    
    if (processedTheory) {
        const theoryLines = processedTheory.split('\n');
        for (let i = 0; i < theoryLines.length; i++) {
            const line = theoryLines[i];
            if (line.trim() && line.trim() !== '< Info >') {
                const styledLine = line.replace(/\*\*(.*?)\*\*/g, '<span class="bullet-dot">●</span> <span class="styled-text">$1</span>');
                theoryHtml += `<p class="detail-line">${styledLine}</p>`;
            } else if (line.trim() !== '< Info >' && line.trim() !== '') {
                theoryHtml += `<p class="detail-line" style="height: 10px; margin: 0;"></p>`;
            }
        }
    } else {
        theoryHtml = '<p style="color: #888;">No theory content yet.</p>';
    }
    
    // Process music section - now an array of music objects
    if (detailData.music && Array.isArray(detailData.music) && detailData.music.length > 0) {
        detailData.music.forEach(song => {
            let songLine = '';
            if (song.title) songLine += `<strong>${escapeHtml(song.title)}</strong>`;
            if (song.artist) songLine += ` - ${escapeHtml(song.artist)}`;
            if (song.part) songLine += ` <span style="color: #666;">(${escapeHtml(song.part)})</span>`;
            if (song.genre) songLine += ` <span class="genre-badge">${escapeHtml(song.genre)}</span>`;
            
            if (songLine) {
                musicHtml += `<p class="detail-line music-example">${songLine}</p>`;
            }
        });
    } else {
        musicHtml = '<p style="color: #888;">No music examples yet.</p>';
    }
    
    // Find the visible detailContent within progressionInfoPage
    const detailContent = getVisibleDetailContent();
    if (!detailContent) return;
    
    detailContent.innerHTML = `
        <div class="detail-box">
            <h2 class="detail-section-title">Theory</h2>
            <div class="detail-body">
                ${theoryHtml}
            </div>
            <h2 class="detail-section-title">Music Examples</h2>
            <div class="detail-body">
                ${musicHtml}
            </div>
        </div>
    `;
}

// Load progression detail for SPA
function loadProgressionDetail() {
    // First priority: use window.lastSelectedUniqueKey (most recent click)
    if (window.lastSelectedUniqueKey) {
        currentUniqueKey = window.lastSelectedUniqueKey;
        currentLineTitle = window.lastSelectedLineTitle;
        currentProgId = window.lastSelectedProgIndex ? parseInt(window.lastSelectedProgIndex) : null;
    } else {
        // Fallback: try to get lineTitle from URL params
        const params = new URLSearchParams(window.location.search);
        let lineTitle = params.get('lineTitle');
        const progIndex = params.get('progIndex');
        
        if (!lineTitle) {
            const detailContent = getVisibleDetailContent();
            if (detailContent) detailContent.innerHTML = '<p>No progression selected.</p>';
            return;
        }
        
        currentLineTitle = decodeURIComponent(lineTitle);
        currentProgId = progIndex ? parseInt(progIndex) : null;
        currentUniqueKey = progIndex ? `${progIndex}:${currentLineTitle}` : currentLineTitle;
    }
    
    loadDetailView();
}

// Load progression detail
window.addEventListener('DOMContentLoaded', () => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get('id');
    let lineTitle = params.get('lineTitle');
    
    if (id === null && !lineTitle) {
        const detailContent = getVisibleDetailContent();
        if (detailContent) detailContent.innerHTML = '<p>No progression selected.</p>';
        return;
    }
    
    if (id !== null) {
        currentProgId = parseInt(id);
        currentLineTitle = lineTitle ? decodeURIComponent(lineTitle) : '';
    } else if (lineTitle) {
        currentLineTitle = decodeURIComponent(lineTitle);
    }
    
    const progs = JSON.parse(localStorage.getItem('musicProgressions')) || [];
    
    if (id !== null) {
        const prog = progs[currentProgId];
        if (!prog) {
            const detailContent = getVisibleDetailContent();
            if (detailContent) detailContent.innerHTML = '<p>Progression not found.</p>';
            return;
        }
    }
    
    loadDetailView();
});

// Show theory tooltip when hovering over a line
function showTheoryTooltip(lineTitle, event) {
    // Remove existing tooltip
    hideTheoryTooltip();
    
    const theoryName = lineTitle.trim();
    
    // Get theory definition from Music Theory page storage
    const musicTheory = JSON.parse(localStorage.getItem('musicTheory')) || {};
    
    // Try to find exact match first
    let theoryData = musicTheory[theoryName];
    let tooltipContent = '';
    
    // If not found, try case-insensitive search
    if (!theoryData) {
        for (const key in musicTheory) {
            if (key.toLowerCase() === theoryName.toLowerCase()) {
                theoryData = musicTheory[key];
                break;
            }
        }
    }
    
    // If not found, try partial match (check if theory name appears in stored theory content)
    if (!theoryData) {
        for (const key in musicTheory) {
            const data = musicTheory[key];
            const theory = typeof data === 'string' ? data : (data.theory || '');
            // Check first line (main title)
            const firstLine = theory.split('\n')[0];
            if (firstLine.toLowerCase() === theoryName.toLowerCase()) {
                theoryData = musicTheory[key];
                break;
            }
        }
    }
    
    // If still not found, search in subtitles
    if (!theoryData) {
        for (const key in musicTheory) {
            const data = musicTheory[key];
            const theory = typeof data === 'string' ? data : (data.theory || '');
            const lines = theory.split('\n');
            
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i].trim();
                // Check if this line is a subtitle matching our search
                if (line.startsWith('- ') && line.slice(2).toLowerCase() === theoryName.toLowerCase()) {
                    // Found it as a subtitle, extract its info
                    for (let j = i + 1; j < lines.length; j++) {
                        const contentLine = lines[j].trim();
                        if (contentLine === '< Info >') {
                            // Extract content after Info marker until next subtitle or end
                            for (let k = j + 1; k < lines.length; k++) {
                                const infoLine = lines[k].trim();
                                if (infoLine.startsWith('- ') || infoLine === '') break;
                                if (infoLine) tooltipContent += infoLine + '\n';
                            }
                            break;
                        }
                    }
                    if (tooltipContent) break;
                }
            }
            if (tooltipContent) break;
        }
        
        if (!tooltipContent) {
            // Theory not found - show helpful message
            tooltipContent = `<p class="tooltip-line" style="color: #999; font-style: italic;">Theory definition not found. Add to Music Theory page.</p>`;
        }
    }
    
    if (!tooltipContent && theoryData) {
        const theory = typeof theoryData === 'string' ? theoryData : (theoryData.theory || '');
        if (!theory.trim()) return;
        
        // Extract content after "< Info >" until empty line
        const lines = theory.split('\n');
        let inInfoSection = false;
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            
            if (line.trim() === '< Info >') {
                inInfoSection = true;
                continue;
            }
            
            if (inInfoSection) {
                if (line.trim() === '') {
                    break; // Stop at empty line
                }
                if (line.trim()) {
                    const styled = line.replace(/\*\*(.*?)\*\*/g, '<span class="tooltip-styled">$1</span>');
                    tooltipContent += `<p class="tooltip-line">${escapeHtml(styled)}</p>`;
                }
            }
        }
        
        // If no info section found, show first 5 lines
        if (!tooltipContent.trim()) {
            for (let i = 0; i < Math.min(5, lines.length); i++) {
                if (lines[i].trim()) {
                    const styled = lines[i].replace(/\*\*(.*?)\*\*/g, '<span class="tooltip-styled">$1</span>');
                    tooltipContent += `<p class="tooltip-line">${escapeHtml(styled)}</p>`;
                }
            }
        }
    } else if (!tooltipContent) {
        // No theory data found at all
        return;
    }
    
    // Create tooltip
    const tooltip = document.createElement('div');
    tooltip.id = 'progression-theory-tooltip';
    tooltip.className = 'progression-theory-tooltip';
    
    tooltip.innerHTML = `
        <div class="tooltip-content">
            <div class="tooltip-theory">${tooltipContent}</div>
        </div>
    `;
    

    document.body.appendChild(tooltip);
    
    // Position near mouse with bounds checking
    const x = Math.min(event.pageX + 15, window.innerWidth - 370);
    const y = Math.min(event.pageY + 10, window.innerHeight - 260);
    tooltip.style.left = x + 'px';
    tooltip.style.top = y + 'px';
    tooltip.style.display = 'block';
    

}

// Hide theory tooltip
function hideTheoryTooltip() {
    const tooltip = document.getElementById('progression-theory-tooltip');
    if (tooltip) {
        tooltip.remove();
    }
}


