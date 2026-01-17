// --- Progression management ---
let editingProgIndex = null;

// Helper function to prevent HTML injection
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Config: enable edit UI only when viewing locally
const EDIT_UI_ENABLED = (
    location.hostname === 'localhost' ||
    location.hostname === '127.0.0.1' ||
    location.protocol === 'file:'
);

// Owner mode detection based on local-only config
function isOwnerMode() {
    return EDIT_UI_ENABLED;
}

// Initialize progressions if empty
function initializeProgressions() {
    let progs = JSON.parse(localStorage.getItem('musicProgressions')) || [];
    if (progs.length === 0) {
        progs = [
            { title: '1 2 4 6', content: '1 - 2 - 4 - 6m' },
            { title: '1', content: '1' },
            { title: 'b2', content: 'b2' },
            { title: '2', content: '2' },
            { title: 'b3', content: 'b3' },
            { title: '3', content: '3' },
            { title: '4', content: '4' },
            { title: '#4', content: '#4' },
            { title: '5', content: '5' },
            { title: 'b6', content: 'b6' },
            { title: '6', content: '6' },
            { title: 'b7', content: 'b7' },
            { title: '7', content: '7' },
            { title: '6 4 5 1', content: '6m - 4 - 5 - 1\n6m - 4 - 5 - 1 - 5/7\n6m - 4 - 5 - 1 - 3/7' },
            { title: '6 3 4 1', content: '6m - 3m - 4 - 5\n6m - 3m - 4 - 1' },
            { title: '4 5 3 6', content: '4 - 5 - 3m - 6m' },
            { title: '2 5 1', content: '2m - 5 - 1' },
            { title: '1 3 6 5', content: '1 - 3m - 6m - 5' }
        ];
        localStorage.setItem('musicProgressions', JSON.stringify(progs));
    }
    return progs;
}

function loadProgressions() {
    initializeProgressions();
    const progs = JSON.parse(localStorage.getItem('musicProgressions')) || [];
    const list = document.getElementById('progressionsList');
    list.innerHTML = '';
    
    // Group progressions by first character(s)
    const groups = {};
    progs.forEach((prog, idx) => {
        let key = prog.title.charAt(0);
        if ((key === 'b' || key === '#') && prog.title.length > 1) {
            key = prog.title.substring(0, 2);
        }
        if (!groups[key]) {
            groups[key] = [];
        }
        groups[key].push({ ...prog, origIndex: idx });
    });
    
    // Define display order: requested descending groups
    const displayOrder = ['7','b7','6','b6','5','#4','4','3','b3','2','b2','1'];
    
    displayOrder.forEach(key => {
        if (groups[key] && groups[key].length > 0) {
            const groupHeader = document.createElement('div');
            groupHeader.className = 'group-header';
            groupHeader.innerHTML = `<h2>${key}</h2>`;
            list.appendChild(groupHeader);
            
            groups[key].forEach((prog, idx) => {
                const elem = document.createElement('div');
                elem.className = 'progression-item';
                elem.id = `prog-${prog.origIndex}`;
                const lines = prog.content.split('\n').map(l => `<p class="progression-notes">${escapeHtml(l)}</p>`).join('');
                const editControls = isOwnerMode() ? `
                    <div class="note-controls">
                        <button class="note-edit" onclick="startInlineEdit(${prog.origIndex})">Edit</button>
                    </div>
                ` : '';
                elem.innerHTML = `
                    <div class="progression-title-row">
                        <h3>${escapeHtml(prog.title)}</h3>
                    </div>
                    <div class="prog-content" id="content-${prog.origIndex}">${lines}</div>
                    ${editControls}
                `;
                list.appendChild(elem);
            });
        }
    });
}

function startInlineEdit(index) {
    if (!isOwnerMode()) {
        return; // editing disabled when not in owner mode
    }
    const progs = JSON.parse(localStorage.getItem('musicProgressions')) || [];
    const prog = progs[index];
    const elem = document.getElementById(`prog-${index}`);
    
    elem.innerHTML = `
        <input type="text" class="inline-title" value="${escapeHtml(prog.title)}" id="edit-title-${index}" />
        <textarea class="inline-content" id="edit-content-${index}">${escapeHtml(prog.content)}</textarea>
        <div class="note-controls">
            <button class="note-edit" onclick="saveInlineEdit(${index})">Save</button>
            <button class="note-delete" onclick="cancelInlineEdit(${index})">Cancel</button>
        </div>
    `;
}

function saveInlineEdit(index) {
    const progs = JSON.parse(localStorage.getItem('musicProgressions')) || [];
    const title = document.getElementById(`edit-title-${index}`).value.trim();
    const content = document.getElementById(`edit-content-${index}`).value.trim();
    
    if (!title || !content) {
        alert('Please fill in title and content!');
        return;
    }
    
    progs[index] = { title, content };
    localStorage.setItem('musicProgressions', JSON.stringify(progs));
    loadProgressions();
}

function cancelInlineEdit(index) {
    loadProgressions();
}

// Load progressions when page starts
window.addEventListener('DOMContentLoaded', loadProgressions);
