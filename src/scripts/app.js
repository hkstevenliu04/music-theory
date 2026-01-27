// ==================== DATA SERVICE (Session-only cache) ====================
const DataService = {
    chordProgressions: null,
    musicTheory: null,
    progressionInfo: null,
    
    async getChordProgressions() {
        // Return cached if already loaded this session
        if (this.chordProgressions) {
            return this.chordProgressions;
        }
        
        try {
            const response = await fetch('pages/json/chordProgressions.json');
            const data = await response.json();
            
            // Transform to expected format
            const progressions = data.map(group => ({
                title: group.note,
                content: group.note,
                progressions: group.progressions || []
            }));
            
            // Cache in memory for this session only
            this.chordProgressions = progressions;
            console.log('Loaded', progressions.length, 'progressions from chordProgressions.json');
            return progressions;
        } catch (error) {
            console.error('Failed to load chordProgressions.json:', error);
            // Fallback defaults
            const defaults = ["1","b2","2","b3","3","4","#4","5","b6","6","b7","7"].map(note => ({
                title: note,
                content: note,
                progressions: []
            }));
            this.chordProgressions = defaults;
            return defaults;
        }
    },
    
    async getMusicTheory() {
        // Return cached if already loaded this session
        if (this.musicTheory) {
            return this.musicTheory;
        }
        
        try {
            const response = await fetch('pages/json/musicTheory.json');
            const data = await response.json();
            
            // Cache in memory for this session only
            this.musicTheory = data;
            console.log('Loaded', data.length, 'theory items from musicTheory.json');
            return data;
        } catch (error) {
            console.error('Failed to load musicTheory.json:', error);
            this.musicTheory = [];
            return [];
        }
    },
    
    async getProgressionInfo() {
        // Return cached if already loaded this session
        if (this.progressionInfo) {
            return this.progressionInfo;
        }
        
        try {
            const response = await fetch('pages/json/progressionInfo.json');
            const data = await response.json();
            
            // Cache in memory for this session only
            this.progressionInfo = data;
            console.log('Loaded progression info from progressionInfo.json');
            return data;
        } catch (error) {
            console.error('Failed to load progressionInfo.json:', error);
            this.progressionInfo = {};
            return {};
        }
    },
    
    // Clear cache (for testing/refresh)
    clearCache() {
        this.chordProgressions = null;
        this.musicTheory = null;
        this.progressionInfo = null;
    }
};

// ==================== INDEXEDDB (Settings ONLY) ====================
class MusicTheoryDB {
    constructor() {
        this.dbName = 'MusicTheoryDB';
        this.version = 2; // Incremented version to trigger upgrade
        this.db = null;
        this.ready = false;
    }

    async init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.version);

            request.onerror = () => {
                console.error('IndexedDB error:', request.error);
                reject(request.error);
            };

            request.onsuccess = () => {
                this.db = request.result;
                this.ready = true;
                resolve(this.db);
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                
                // Remove old content stores if they exist
                ['progressions', 'groupNames', 'musicTheory'].forEach(store => {
                    if (db.objectStoreNames.contains(store)) {
                        db.deleteObjectStore(store);
                    }
                });
                
                // Only keep settings store
                if (!db.objectStoreNames.contains('settings')) {
                    db.createObjectStore('settings', { keyPath: 'key' });
                }
            };
        });
    }

    async set(storeName, key, value) {
        if (!this.ready) await this.init();
        
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], 'readwrite');
            const store = transaction.objectStore(storeName);
            
            let obj;
            if (storeName === 'settings') {
                obj = { key: key, data: value };
            } else {
                obj = { id: key, data: value };
            }
            
            const request = store.put(obj);
            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve(value);
        });
    }

    async get(storeName, key) {
        if (!this.ready) await this.init();
        
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], 'readonly');
            const store = transaction.objectStore(storeName);
            const request = store.get(key);

            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                const result = request.result;
                resolve(result ? result.data : null);
            };
        });
    }

    async remove(storeName, key) {
        if (!this.ready) await this.init();
        
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.delete(key);

            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve();
        });
    }

    async clear(storeName) {
        if (!this.ready) await this.init();
        
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.clear();

            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve();
        });
    }

    async migrateFromLocalStorage() {
        try {
            // Only migrate user preferences, NOT content data
            const musicVolume = localStorage.getItem('musicVolume');
            if (musicVolume) {
                await this.set('settings', 'musicVolume', parseFloat(musicVolume));
            }

            const musicEnabled = localStorage.getItem('musicEnabled');
            if (musicEnabled) {
                await this.set('settings', 'musicEnabled', musicEnabled === 'true');
            }

            const sfxVolume = localStorage.getItem('sfxVolume');
            if (sfxVolume) {
                await this.set('settings', 'sfxVolume', parseFloat(sfxVolume));
            }

            const sfxEnabled = localStorage.getItem('sfxEnabled');
            if (sfxEnabled) {
                await this.set('settings', 'sfxEnabled', sfxEnabled === 'true');
            }
            
            // Clean up old content data from localStorage
            localStorage.removeItem('musicProgressions');
            localStorage.removeItem('progressionDetails');
            localStorage.removeItem('groupCustomNames');
            localStorage.removeItem('musicTheory');
            localStorage.removeItem('siteDescription');
        } catch (error) {
            console.error('Error during migration:', error);
        }
    }
}

const db = new MusicTheoryDB();
db.init().then(() => {
    db.migrateFromLocalStorage();
}).catch(error => {
    console.error('Failed to initialize IndexedDB:', error);
    
    // If version error, delete and recreate the database
    if (error.name === 'VersionError') {
        console.log('Deleting old database and recreating...');
        const deleteRequest = indexedDB.deleteDatabase('MusicTheoryDB');
        deleteRequest.onsuccess = () => {
            console.log('Database deleted, reinitializing...');
            db.init().then(() => {
                db.migrateFromLocalStorage();
            }).catch(err => {
                console.error('Failed to reinitialize after delete:', err);
            });
        };
        deleteRequest.onerror = () => {
            console.error('Failed to delete database:', deleteRequest.error);
        };
    }
});

/* ==================== ROUTER ==================== */
class Router {
    constructor() {
        this.currentPage = 'homePage';
        this.pages = {
            'index.html': { id: 'homePage', title: 'Home', showBack: false },
            'chord-progression.html': { id: 'chordProgressionPage', title: 'Chord Progression', showBack: true },
            'progression-info.html': { id: 'progressionInfoPage', title: 'Progression Detail', showBack: true },
            'music-theory.html': { id: 'musicTheoryPage', title: 'Music Theory', showBack: true },
            'chord-generator.html': { id: 'chordGeneratorPage', title: 'Chord Generator', showBack: true }
        };
    }

    formatTitleFromFilename(page) {
        const base = (page || '').split('/').pop().replace(/\.html?$/i, '').replace(/[-_]+/g, ' ').trim();
        if (!base) return 'Home';
        return base
            .split(' ')
            .map(word => word ? word.charAt(0).toUpperCase() + word.slice(1) : '')
            .join(' ');
    }

    init() {
        document.addEventListener('click', (e) => {
            const link = e.target.closest('a.nav-link, a.nav-box-card');
            if (link && link.href) {
                e.preventDefault();
                const href = link.href.split('/').pop().split('?')[0];
                this.navigate(href);
            }
        });

        const backBtn = document.getElementById('backBtn');
        if (backBtn) {
            backBtn.addEventListener('click', () => {
                this.navigate('index.html');
            });
        }

        this.loadPage('index.html');
    }

    navigate(page) {
        this.loadPage(page);
        if (window.location.protocol !== 'file:') {
            window.history.pushState({ page }, '', page);
        }
    }

    loadPage(page) {
        const pageConfig = this.pages[page];
        if (!pageConfig) {
            console.error('Page not found:', page);
            return;
        }

        document.querySelectorAll('.page-section').forEach(el => {
            el.style.display = 'none';
        });

        const pageEl = document.getElementById(pageConfig.id);
        if (pageEl) {
            pageEl.style.display = 'block';
        }

        const titleEl = document.getElementById('pageTitle');
        if (titleEl) {
            const titleText = pageConfig.title || this.formatTitleFromFilename(page);
            titleEl.textContent = titleText;
        }
        
        const backBtn = document.getElementById('backBtn');
        if (backBtn) {
            backBtn.style.display = pageConfig.showBack ? 'block' : 'none';
        }

        const detailControls = document.getElementById('detailControls');
        const progressionControls = document.getElementById('progressionControls');
        if (detailControls) {
            detailControls.style.display = 'none';
        }
        if (progressionControls) {
            progressionControls.style.display = 'none';
        }
        
        if (page === 'progression-info.html' && detailControls) {
            detailControls.style.display = 'block';
        } else if (page === 'chord-progression.html' && progressionControls) {
            progressionControls.style.display = 'block';
        }

        // Show floating title only on home
        document.body.classList.toggle('show-floating-title', page === 'index.html');

        this.initPage(page);
        window.scrollTo(0, 0);
        this.currentPage = page;
    }

    initPage(page) {
        if (page === 'chord-progression.html') {
            if (typeof renderProgressions === 'function') renderProgressions();
        } else if (page === 'progression-info.html') {
            if (typeof loadProgressionDetail === 'function') loadProgressionDetail();
        } else if (page === 'music-theory.html') {
            if (typeof loadTheories === 'function') loadTheories();
        } else if (page === 'chord-generator.html') {
            if (typeof initChordGenerator === 'function') initChordGenerator();
        } else if (page === 'index.html') {
            if (typeof loadSiteDescription === 'function') loadSiteDescription();
        }
    }
}

let router;
document.addEventListener('DOMContentLoaded', () => {
    router = new Router();
    router.init();
});

/* ==================== SOUND EFFECTS ==================== */
const MUSIC_PLAYLIST = [
    'assets/audio/Mitsukiyo-Candy%20Dreamy.mp3',
    'assets/audio/Sharou-superstar.mp3',
    'assets/audio/Sharou-Anyone%20in%202025_.mp3',
    'assets/audio/Sharou-3_03%20PM.mp3',
    'assets/audio/Sharou-2_23%20AM.mp3',
    'assets/audio/Sharou-10.mp3',
    'assets/audio/Sharou-Cassette%20Tape%20Dream.mp3',
    'assets/audio/Sharou-Sheep%20of%20the%20Far%20East%2C%20Dancing%20with%20the%20Telecaster.mp3',
    'assets/audio/Sharou-You%20and%20Me.mp3'
];

class SoundEffects {
    constructor() {
        this.audioContext = null;
        this.initialized = false;
        this.musicPlaying = false;
        this.musicGain = null;
        this.musicVolume = localStorage.getItem('musicVolume') ? parseFloat(localStorage.getItem('musicVolume')) : 0.15;
        this.shouldPlayMusic = localStorage.getItem('musicEnabled') !== 'false';
        this.sfxVolume = localStorage.getItem('sfxVolume') ? parseFloat(localStorage.getItem('sfxVolume')) : 50;
        this.sfxEnabled = localStorage.getItem('sfxEnabled') === 'true' ? true : true;
        this.audioElement = null;
        this.currentTrackIndex = 0;
    }

    init() {
        if (this.initialized) return;
        try {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            this.audioContext = new AudioContext();
            this.initialized = true;
        } catch (e) {}
    }

    playHoverSound() {
        if (!this.audioContext || !this.sfxEnabled) return;
        if (!this.audioContext) this.init();
        if (!this.audioContext) return;
        this.playToneSound(700, 0.05, 0.12);
    }

    playClickSound() {
        if (!this.audioContext || !this.sfxEnabled) return;
        if (!this.audioContext) this.init();
        if (!this.audioContext) return;
        this.playToneSound(1200, 0.1, 0.15, 600);
    }

    playSoftBeepSound() {
        if (!this.audioContext || !this.sfxEnabled) return;
        if (!this.audioContext) this.init();
        if (!this.audioContext) return;
        this.playToneSound(700, 0.05, 0.12);
    }

    playToneSound(frequency, volumeFactor, duration, endFrequency = null) {
        try {
            const now = this.audioContext.currentTime;
            const osc = this.audioContext.createOscillator();
            const gain = this.audioContext.createGain();
            osc.connect(gain);
            gain.connect(this.audioContext.destination);
            
            osc.frequency.setValueAtTime(frequency, now);
            if (endFrequency) {
                osc.frequency.exponentialRampToValueAtTime(endFrequency, now + duration);
            }
            
            const sfxGain = (this.sfxVolume / 100) * volumeFactor;
            gain.gain.setValueAtTime(sfxGain, now);
            gain.gain.exponentialRampToValueAtTime(0.01 * (this.sfxVolume / 100), now + duration);
            
            osc.start(now);
            osc.stop(now + duration);
        } catch (e) {
            console.warn('Failed to play tone sound:', e);
        }
    }

    setMusicVolume(volume) {
        this.musicVolume = Math.max(0, Math.min(1, volume / 100));
        localStorage.setItem('musicVolume', this.musicVolume);
        if (typeof db !== 'undefined' && db.ready) {
            db.set('settings', 'musicVolume', this.musicVolume).catch(() => {});
        }
        if (this.audioElement) {
            this.audioElement.volume = this.musicVolume;
        }
    }

    setSfxVolume(volume) {
        this.sfxVolume = Math.max(0, Math.min(100, volume));
        localStorage.setItem('sfxVolume', this.sfxVolume);
        if (typeof db !== 'undefined' && db.ready) {
            db.set('settings', 'sfxVolume', this.sfxVolume).catch(() => {});
        }
    }

    setSfxEnabled(enabled) {
        this.sfxEnabled = enabled;
        localStorage.setItem('sfxEnabled', enabled ? 'true' : 'false');
        if (typeof db !== 'undefined' && db.ready) {
            db.set('settings', 'sfxEnabled', enabled).catch(() => {});
        }
    }

    playNextTrack() {
        if (!this.musicPlaying) return;

        const randomIndex = Math.floor(Math.random() * MUSIC_PLAYLIST.length);
        const trackUrl = MUSIC_PLAYLIST[randomIndex];

        if (this.audioElement) {
            this.audioElement.pause();
            this.audioElement.currentTime = 0;
            this.audioElement.src = trackUrl;
            this.audioElement.volume = this.musicVolume;
            this.audioElement.load();
            
            const playAttempt = () => {
                this.audioElement.play().catch(err => {
                    console.error('Could not play audio:', err);
                    this.playNextTrackAfterDelay();
                });
            };
            
            this.audioElement.removeEventListener('canplay', playAttempt);
            this.audioElement.addEventListener('canplay', playAttempt, { once: true });
        }
    }

    playNextTrackAfterDelay() {
        if (this.musicPlaying) {
            setTimeout(() => this.playNextTrack(), 2000);
        }
    }

    playBackgroundMusic() {
        if (this.musicPlaying) return;
        if (!this.audioContext) this.init();

        this.musicPlaying = true;
        localStorage.setItem('musicEnabled', 'true');
        if (typeof db !== 'undefined' && db.ready) {
            db.set('settings', 'musicEnabled', true).catch(() => {});
        }

        if (!this.audioElement) {
            this.audioElement = new Audio();
            this.audioElement.crossOrigin = 'anonymous';
            this.audioElement.volume = this.musicVolume;

            this.audioElement.addEventListener('ended', () => {
                setTimeout(() => this.playNextTrack(), 500);
            });

            this.audioElement.addEventListener('error', (err) => {
                console.error('Audio element error:', err);
                this.playNextTrackAfterDelay();
            });
        }

        this.playNextTrack();
    }

    stopBackgroundMusic() {
        this.musicPlaying = false;
        localStorage.setItem('musicEnabled', 'false');
        if (typeof db !== 'undefined' && db.ready) {
            db.set('settings', 'musicEnabled', false).catch(() => {});
        }
        if (this.audioElement) {
            this.audioElement.pause();
            this.audioElement.currentTime = 0;
        }
    }
}

const soundEffects = new SoundEffects();

document.addEventListener('DOMContentLoaded', function() {
    const initializeAudio = function() {
        soundEffects.init();
        document.removeEventListener('mousedown', initializeAudio);
        document.removeEventListener('touchstart', initializeAudio);
        document.removeEventListener('click', initializeAudio);
    };
    
    document.addEventListener('mousedown', initializeAudio);
    document.addEventListener('touchstart', initializeAudio);
    document.addEventListener('click', initializeAudio);

    const buttons = document.querySelectorAll('button, a, .clickable-line, .back-btn, .group-title');
    buttons.forEach(button => {
        button.addEventListener('mouseenter', () => soundEffects.playSoftBeepSound());
        button.addEventListener('mousedown', () => soundEffects.playClickSound());
    });

    const musicToggleBtn = document.getElementById('musicToggleBtn');
    const sfxToggleBtn = document.getElementById('sfxToggleBtn');
    const volumeSlider = document.getElementById('volumeSlider');
    const volumeLabel = document.getElementById('volumeLabel');
    const sfxSlider = document.getElementById('sfxSlider');
    const sfxLabel = document.getElementById('sfxLabel');

    if (volumeSlider) {
        const savedVolume = localStorage.getItem('musicVolume');
        if (savedVolume) {
            const vol = parseFloat(savedVolume) * 100;
            volumeSlider.value = vol;
            if (volumeLabel) volumeLabel.textContent = Math.round(vol) + '%';
        }
    }

    if (sfxSlider) {
        sfxSlider.value = soundEffects.sfxVolume;
        if (sfxLabel) sfxLabel.textContent = Math.round(soundEffects.sfxVolume) + '%';
    }

    const updateSfxButtonState = () => {
        if (sfxToggleBtn) {
            if (soundEffects.sfxEnabled) {
                sfxToggleBtn.classList.add('active');
                sfxToggleBtn.textContent = '🔊';
            } else {
                sfxToggleBtn.classList.remove('active');
                sfxToggleBtn.textContent = '🔇';
            }
        }
    };
    updateSfxButtonState();

    if (musicToggleBtn) {
        musicToggleBtn.addEventListener('click', function() {
            if (soundEffects.musicPlaying) {
                soundEffects.stopBackgroundMusic();
                musicToggleBtn.classList.remove('active');
                musicToggleBtn.textContent = '⏹';
            } else {
                soundEffects.init();
                soundEffects.playBackgroundMusic();
                musicToggleBtn.classList.add('active');
                musicToggleBtn.textContent = '🎵';
            }
        });
    }

    if (sfxToggleBtn) {
        sfxToggleBtn.addEventListener('click', function() {
            soundEffects.setSfxEnabled(!soundEffects.sfxEnabled);
            updateSfxButtonState();
        });
    }

    if (volumeSlider) {
        volumeSlider.addEventListener('input', function() {
            soundEffects.setMusicVolume(this.value);
            if (volumeLabel) volumeLabel.textContent = this.value + '%';
        });
    }

    if (sfxSlider) {
        sfxSlider.addEventListener('input', function() {
            soundEffects.setSfxVolume(this.value);
            if (sfxLabel) sfxLabel.textContent = this.value + '%';
        });
    }

    const shouldAutoPlay = localStorage.getItem('musicEnabled') !== 'false';
    let autoPlayTriggered = false;
    
    let autoPlayOnFirstInteraction = function() {
        if (!autoPlayTriggered && shouldAutoPlay && !soundEffects.musicPlaying) {
            autoPlayTriggered = true;
            soundEffects.init();
            soundEffects.playBackgroundMusic();
            if (musicToggleBtn) {
                musicToggleBtn.classList.add('active');
                musicToggleBtn.textContent = '🎵';
            }
        }
        document.removeEventListener('mousedown', autoPlayOnFirstInteraction);
        document.removeEventListener('touchstart', autoPlayOnFirstInteraction);
        document.removeEventListener('click', autoPlayOnFirstInteraction);
    };
    
    if (shouldAutoPlay) {
        document.addEventListener('mousedown', autoPlayOnFirstInteraction);
        document.addEventListener('touchstart', autoPlayOnFirstInteraction);
        document.addEventListener('click', autoPlayOnFirstInteraction);
    }

    const observer = new MutationObserver(function(mutations) {
        mutations.forEach(function(mutation) {
            if (mutation.addedNodes.length) {
                mutation.addedNodes.forEach(function(node) {
                    if (node.nodeType === 1) {
                        const newButtons = node.querySelectorAll ? node.querySelectorAll('button, a, .clickable-line, .back-btn, .group-title') : [];
                        if (node.tagName === 'BUTTON' || node.tagName === 'A') {
                            node.addEventListener('mouseenter', () => soundEffects.playSoftBeepSound());
                            node.addEventListener('mousedown', () => soundEffects.playClickSound());
                        }
                        newButtons.forEach(btn => {
                            btn.addEventListener('mouseenter', () => soundEffects.playSoftBeepSound());
                            btn.addEventListener('mousedown', () => soundEffects.playClickSound());
                        });
                    }
                });
            }
        });
    });

    observer.observe(document.body, { childList: true, subtree: true });
});

/* ==================== PROGRESSION SCRIPT (DEPRECATED - kept for compatibility) ==================== */
// NOTE: These functions are deprecated. Use DataService.getChordProgressions() instead
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Deprecated - only used for settings now
const StorageManager = {
    async set(storeName, key, value) {
        // Only allow writing settings, not content
        if (storeName === 'settings') {
            try {
                if (typeof db !== 'undefined' && db.ready) {
                    await db.set(storeName, key, value);
                }
            } catch (error) {
                console.warn('IndexedDB write failed, using localStorage:', error);
            }
            localStorage.setItem(key, JSON.stringify(value));
        } else {
            console.warn('StorageManager: Only settings can be saved. Content comes from JSON.');
        }
    },

    async get(storeName, key) {
        // Only allow reading settings
        if (storeName === 'settings') {
            try {
                if (typeof db !== 'undefined' && db.ready) {
                    const value = await db.get(storeName, key);
                    if (value !== null) {
                        return value;
                    }
                }
            } catch (error) {
                console.warn('IndexedDB read failed, using localStorage:', error);
            }
            const value = localStorage.getItem(key);
            return value ? JSON.parse(value) : null;
        }
        return null;
    }
};

// Deprecated constants
const STORAGE_KEYS = {
    PROGRESSIONS: 'musicProgressions',
    GROUP_NAMES: 'groupCustomNames',
    SITE_DESCRIPTION: 'siteDescription'
};

let currentOpenGroup = null;

// Deprecated - Use DataService.getChordProgressions() instead
function initializeProgressions() {
    console.warn('initializeProgressions is deprecated. Use DataService.getChordProgressions()');
    return DataService.getChordProgressions();
}

// Deprecated - Use DataService.getChordProgressions() instead
function loadProgressions() {
    console.warn('loadProgressions is deprecated. Use DataService.getChordProgressions()');
    DataService.getChordProgressions().then(() => {
        const progs = JSON.parse(localStorage.getItem(STORAGE_KEYS.PROGRESSIONS)) || [];

    const detailControls = document.getElementById('detailControls');
    if (detailControls) {
        detailControls.style.display = 'none';
    }

    const progressionControls = document.getElementById('progressionControls');
    if (progressionControls) {
        progressionControls.innerHTML = '';
        progressionControls.style.display = 'none';
    }
    
    const list = document.getElementById('progressionsList');
    if (!list) {
        console.error('progressionsList element not found!');
        return;
    }
    list.innerHTML = '';
    
    const boxesWrapper = document.createElement('div');
    boxesWrapper.className = 'boxes-wrapper';
    
    const contentWrapper = document.createElement('div');
    contentWrapper.className = 'content-wrapper';
    
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
    
    const displayOrder = ['1','b2','2','b3','3','4','#4','5','b6','6','b7','7'];
    
    const allKeys = Object.keys(groups).sort();
    allKeys.forEach(key => {
        if (!displayOrder.includes(key)) {
            displayOrder.push(key);
        }
    });
    
    displayOrder.forEach((key, displayIdx) => {
        if (groups[key] && groups[key].length > 0) {
            const groupBox = document.createElement('div');
            groupBox.className = 'group-box';
            
            const customNames = JSON.parse(localStorage.getItem(STORAGE_KEYS.GROUP_NAMES)) || {};
            const groupTitleText = customNames[key] || key;
            
            const titleBox = document.createElement('div');
            titleBox.className = 'group-title-box';
            titleBox.setAttribute('data-group-key', key);
            titleBox.onmouseenter = () => toggleGroupContent(key);
            titleBox.innerHTML = `
                <span class="group-title-text">${escapeHtml(groupTitleText)}</span>
            `;
            
            groupBox.appendChild(titleBox);
            boxesWrapper.appendChild(groupBox);
            
            const contentContainer = document.createElement('div');
            contentContainer.className = 'group-content-container collapsed';
            contentContainer.id = `group-content-${key}`;
            contentContainer.setAttribute('data-group-key', key);
            
            const groupContentBox = document.createElement('div');
            groupContentBox.className = 'group-content-box';
            
            let allContent = '';
            
            groups[key].forEach((prog, idx) => {
                // Check if we have progressions data from JSON
                if (prog.progressions && prog.progressions.length > 0) {
                    prog.progressions.forEach((progression, progIdx) => {
                        // Build the chord progression line
                        let chordLine = '';
                        if (Array.isArray(progression.chords)) {
                            // Handle nested arrays (for complex progressions)
                            if (Array.isArray(progression.chords[0])) {
                                chordLine = progression.chords.map(barChords => 
                                    Array.isArray(barChords) ? barChords.join(' ') : barChords
                                ).join(' - ');
                            } else {
                                chordLine = progression.chords.join(' - ');
                            }
                        }
                        
                        // Create the progression grid (only show chords, no theory/music info)
                        if (chordLine) {
                            const raw = chordLine;
                            let bars = [];
                            if (raw.includes(' - ')) {
                                bars = raw.split(' - ').map(s => s.trim()).filter(Boolean);
                            } else {
                                const tokens = raw.split(/\s+/).filter(Boolean);
                                const perBar = Math.ceil(tokens.length / 4) || 1;
                                bars = [
                                    tokens.slice(0, perBar).join(' '),
                                    tokens.slice(perBar, perBar * 2).join(' '),
                                    tokens.slice(perBar * 2, perBar * 3).join(' '),
                                    tokens.slice(perBar * 3).join(' ')
                                ].map(s => s.trim());
                            }
                            while (bars.length < 4) bars.push('');
                            if (bars.length > 4) bars = bars.slice(0, 4);

                            const encodedLine = encodeURIComponent(chordLine);
                            let gridHTML = `<div class="progression-grid clickable-line" data-prog-index="${prog.origIndex}" data-line="${encodedLine}">`;
                            bars.forEach((bar) => {
                                gridHTML += `<div class="progression-cell">${escapeHtml(bar)}</div>`;
                            });
                            gridHTML += `</div>`;
                            allContent += `<div class="progression-notes">${gridHTML}</div>`;
                        }
                    });
                } else {
                    // Fallback to old content format
                    const contentLines = prog.content.split('\n');
                    let shouldBeCrimson = false;
                    
                    contentLines.forEach((line, lineIdx) => {
                        if (line.trim() === '****') {
                            shouldBeCrimson = true;
                            return;
                        }
                        
                        if (line.trim()) {
                            const hasStyledText = line.includes('**');
                            const hasContent = line.trim().length > 0;
                            const isClickable = hasContent && !hasStyledText;
                            const crimsonClass = shouldBeCrimson ? 'crimson-text' : '';
                            
                            if (isClickable) {
                                const raw = line.trim();
                                let bars = [];
                                if (raw.includes('|')) {
                                    bars = raw.split('|').map(s => s.trim()).filter(Boolean);
                                } else if (raw.includes(' - ')) {
                                    bars = raw.split(' - ').map(s => s.trim()).filter(Boolean);
                                } else {
                                    const tokens = raw.split(/\s+/).filter(Boolean);
                                    const perBar = Math.ceil(tokens.length / 4) || 1;
                                    bars = [
                                        tokens.slice(0, perBar).join(' '),
                                        tokens.slice(perBar, perBar * 2).join(' '),
                                        tokens.slice(perBar * 2, perBar * 3).join(' '),
                                        tokens.slice(perBar * 3).join(' ')
                                    ].map(s => s.trim());
                                }
                                while (bars.length < 4) bars.push('');
                                if (bars.length > 4) bars = bars.slice(0, 4);

                                const encodedLine = encodeURIComponent(line.trim());
                                let gridHTML = `<div class="progression-grid clickable-line" data-prog-index="${prog.origIndex}" data-line="${encodedLine}">`;
                                bars.forEach((bar) => {
                                    gridHTML += `<div class="progression-cell">${escapeHtml(bar)}</div>`;
                                });
                                gridHTML += `</div>`;
                                allContent += `<div class="progression-notes ${crimsonClass}">${gridHTML}</div>`;
                            } else {
                                const styledText = line.replace(/\*\*(.*?)\*\*/g, '<span class="bullet-dot">●</span> <span class="styled-text">$1</span>');
                                allContent += `<p class="progression-notes ${crimsonClass}">${styledText}</p>`;
                            }
                            
                            if (hasStyledText) {
                                shouldBeCrimson = true;
                            }
                        } else {
                            shouldBeCrimson = false;
                            allContent += `<p class="progression-notes" style="height: 10px; margin: 0;"></p>`;
                        }
                    });
                }
            });
            
            groupContentBox.innerHTML = allContent;
            contentContainer.appendChild(groupContentBox);
            contentWrapper.appendChild(contentContainer);
        }
    });
    
    list.appendChild(boxesWrapper);
    list.appendChild(contentWrapper);
    
    list.addEventListener('click', (e) => {
        const clickableLine = e.target.closest('.clickable-line');
        if (clickableLine) {
            const progIndex = parseInt(clickableLine.getAttribute('data-prog-index'));
            const encodedLine = clickableLine.getAttribute('data-line');
            showDetail(progIndex, encodedLine);
        }
    });
    
    if (currentOpenGroup) {
        const previousContainer = document.getElementById(`group-content-${currentOpenGroup}`);
        if (previousContainer) {
            previousContainer.classList.remove('collapsed');
        }
    }
    }); // Close the promise .then()
}

function toggleGroupContent(key) {
    if (currentOpenGroup === key) {
        return;
    }
    
    const allContainers = document.querySelectorAll('.group-content-container');
    allContainers.forEach(container => {
        if (container.id !== `group-content-${key}`) {
            container.classList.add('collapsed');
        }
    });
    
    const contentContainer = document.getElementById(`group-content-${key}`);
    if (contentContainer) {
        contentContainer.classList.remove('collapsed');
        currentOpenGroup = key;
    } else {
        console.error('Container not found for key:', key);
    }
}

function showDetail(indexOrLineText, encodedLineTitle) {
    let lineTitle = '';
    let progIndex = '';
    
    if (typeof indexOrLineText === 'number') {
        progIndex = String(indexOrLineText);
    } else if (typeof indexOrLineText === 'string') {
        lineTitle = decodeURIComponent(indexOrLineText);
    } 
    
    if (typeof encodedLineTitle === 'string') {
        lineTitle = decodeURIComponent(encodedLineTitle);
    }
    
    if ((lineTitle || progIndex) && router) {
        const uniqueKey = progIndex ? `${progIndex}:${lineTitle}` : lineTitle;
        
        window.lastSelectedLineTitle = lineTitle;
        window.lastSelectedProgIndex = progIndex;
        window.lastSelectedUniqueKey = uniqueKey;
        
        router.loadPage('progression-info.html');
        window.history.pushState({ page: 'progression-info.html', lineTitle, progIndex }, '', 'progression-info.html?lineTitle=' + encodeURIComponent(lineTitle) + '&progIndex=' + progIndex);
    }
}

window.addEventListener('DOMContentLoaded', async () => {
    if (!localStorage.getItem(STORAGE_KEYS.SITE_DESCRIPTION)) {
        localStorage.setItem(STORAGE_KEYS.SITE_DESCRIPTION, 'Learn and explore chord progressions and music theory concepts.');
    }

    if (document.getElementById('siteDescription')) {
        setTimeout(() => {
            loadSiteDescription();
        }, 10);
    }
    
    if (document.getElementById('progressionsList')) {
        loadProgressions();
        setTimeout(() => {
            const group1Container = document.getElementById('group-content-1');
            if (group1Container) {
                group1Container.classList.remove('collapsed');
                currentOpenGroup = '1';
            }
        }, 100);
    }
});

function loadSiteDescription() {
    const defaultDescription = 'Learn and explore chord progressions and music theory concepts.';
    let savedDescription = localStorage.getItem(STORAGE_KEYS.SITE_DESCRIPTION);
    
    if (!savedDescription || savedDescription.trim() === '') {
        savedDescription = defaultDescription;
        localStorage.setItem(STORAGE_KEYS.SITE_DESCRIPTION, defaultDescription);
    }
    
    const siteDescElement = document.getElementById('siteDescription');
    if (siteDescElement) {
        siteDescElement.textContent = savedDescription;
    }
}

function initSettingsPanel() {
    const settingsBtn = document.getElementById('settingsBtn');
    const settingsPanel = document.getElementById('settingsPanel');
    const settingsCloseBtn = document.getElementById('settingsCloseBtn');
    if (!settingsBtn || !settingsPanel) return;
    settingsBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = settingsPanel.classList.contains('open');
        settingsPanel.classList.toggle('open', !isOpen);
    });
    if (settingsCloseBtn) {
        settingsCloseBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            settingsPanel.classList.remove('open');
        });
    }
    document.addEventListener('click', (e) => {
        if (!settingsPanel.contains(e.target) && e.target !== settingsBtn) {
            settingsPanel.classList.remove('open');
        }
    });

    settingsPanel.addEventListener('click', (e) => {
        e.stopPropagation();
    });
}

if (document.readyState !== 'loading') {
    initSettingsPanel();
} else {
    document.addEventListener('DOMContentLoaded', initSettingsPanel);
}
