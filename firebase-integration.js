// Firebase Integration for NEXSUS Platform
// This file extends the main script.js with Firebase functionality

// ==================== FIREBASE ADMIN AUTHENTICATION ====================
class FirebaseAdminAuth {
    constructor() {
        this.adminPassword = 'EVOLUTIONnexsusTEAM2026@';
        this.adminVerification = 'ALISON AI';
        this.isAuthenticated = false;
        this.currentUser = null;
    }

    async authenticateAdmin(password, verification) {
        if (password === this.adminPassword && verification === this.adminVerification) {
            try {
                // Create a custom token for admin (in real app, this would be server-side)
                this.isAuthenticated = true;
                this.currentUser = {
                    uid: 'admin',
                    email: 'admin@nexsus.com',
                    isAdmin: true
                };
                
                // Log the authentication
                await this.addLog('admin_auth', 'Admin authentication successful');
                return true;
            } catch (error) {
                console.error('Authentication error:', error);
                await this.addLog('admin_auth', 'Admin authentication failed');
                return false;
            }
        }
        return false;
    }

    async addLog(type, message) {
        if (!window.firebase) return;
        
        try {
            await window.firebase.addDoc(window.firebase.collection(window.firebase.db, 'logs'), {
                type,
                message,
                timestamp: window.firebase.serverTimestamp(),
                userAgent: navigator.userAgent,
                ip: 'hidden'
            });
        } catch (error) {
            console.error('Error adding log:', error);
        }
    }

    logout() {
        this.isAuthenticated = false;
        this.currentUser = null;
    }
}

// ==================== FIREBASE STORAGE MANAGER ====================
class FirebaseStorageManager {
    constructor() {
        this.maxFileSizes = {
            image: 10 * 1024 * 1024, // 10MB
            video: 100 * 1024 * 1024, // 100MB
            document: 50 * 1024 * 1024 // 50MB
        };
    }

    async uploadFile(file, path, section = 'general') {
        if (!window.firebase || !window.firebase.storage) {
            throw new Error('Firebase not initialized');
        }

        // Validate file size
        const fileType = file.type.startsWith('image/') ? 'image' : 
                        file.type.startsWith('video/') ? 'video' : 'document';
        
        if (file.size > this.maxFileSizes[fileType]) {
            throw new Error(`File too large. Maximum size: ${this.maxFileSizes[fileType] / (1024 * 1024)}MB`);
        }

        try {
            const fileName = `${Date.now()}_${file.name}`;
            const fullPath = `${path}/${section}/${fileName}`;
            const storageRef = window.firebase.ref(window.firebase.storage, fullPath);
            
            const snapshot = await window.firebase.uploadBytes(storageRef, file);
            const downloadURL = await window.firebase.getDownloadURL(snapshot.ref);
            
            return {
                url: downloadURL,
                path: fullPath,
                name: fileName,
                originalName: file.name,
                size: file.size,
                type: file.type,
                uploadDate: new Date().toISOString()
            };
        } catch (error) {
            console.error('Upload error:', error);
            throw error;
        }
    }

    async deleteFile(path) {
        if (!window.firebase || !window.firebase.storage) return false;

        try {
            const storageRef = window.firebase.ref(window.firebase.storage, path);
            await window.firebase.deleteObject(storageRef);
            return true;
        } catch (error) {
            console.error('Delete error:', error);
            return false;
        }
    }

    async listFiles(path) {
        if (!window.firebase || !window.firebase.storage) return [];

        try {
            const storageRef = window.firebase.ref(window.firebase.storage, path);
            const result = await window.firebase.listAll(storageRef);
            
            const files = await Promise.all(
                result.items.map(async (item) => {
                    const url = await window.firebase.getDownloadURL(item);
                    return {
                        name: item.name,
                        path: item.fullPath,
                        url: url
                    };
                })
            );
            
            return files;
        } catch (error) {
            console.error('List files error:', error);
            return [];
        }
    }
}

// ==================== FIREBASE DATABASE MANAGER ====================
class FirebaseDatabaseManager {
    constructor() {
        this.collections = {
            forms: 'forms',
            notifications: 'notifications',
            logs: 'logs',
            territoriali: 'territoriali',
            library: 'library',
            uploads: 'uploads'
        };
    }

    async saveForm(formData, formType) {
        if (!window.firebase) return false;

        try {
            const docData = {
                ...formData,
                formType,
                timestamp: window.firebase.serverTimestamp(),
                status: 'pending'
            };

            const docRef = await window.firebase.addDoc(
                window.firebase.collection(window.firebase.db, this.collections.forms),
                docData
            );

            // Add notification for admin
            await this.addNotification(`Nuova registrazione: ${formType}`, docData);
            
            return docRef.id;
        } catch (error) {
            console.error('Error saving form:', error);
            return false;
        }
    }

    async addNotification(message, data = {}) {
        if (!window.firebase) return false;

        try {
            await window.firebase.addDoc(
                window.firebase.collection(window.firebase.db, this.collections.notifications),
                {
                    message,
                    data,
                    timestamp: window.firebase.serverTimestamp(),
                    read: false,
                    type: 'form_submission'
                }
            );
            return true;
        } catch (error) {
            console.error('Error adding notification:', error);
            return false;
        }
    }

    async getForms(formType = null) {
        if (!window.firebase) return [];

        try {
            let q = window.firebase.collection(window.firebase.db, this.collections.forms);
            
            if (formType) {
                q = window.firebase.query(q, 
                    window.firebase.where('formType', '==', formType),
                    window.firebase.orderBy('timestamp', 'desc')
                );
            } else {
                q = window.firebase.query(q, window.firebase.orderBy('timestamp', 'desc'));
            }

            const querySnapshot = await window.firebase.getDocs(q);
            const forms = [];
            
            querySnapshot.forEach((doc) => {
                forms.push({
                    id: doc.id,
                    ...doc.data()
                });
            });
            
            return forms;
        } catch (error) {
            console.error('Error getting forms:', error);
            return [];
        }
    }

    async getNotifications() {
        if (!window.firebase) return [];

        try {
            const q = window.firebase.query(
                window.firebase.collection(window.firebase.db, this.collections.notifications),
                window.firebase.orderBy('timestamp', 'desc')
            );

            const querySnapshot = await window.firebase.getDocs(q);
            const notifications = [];
            
            querySnapshot.forEach((doc) => {
                notifications.push({
                    id: doc.id,
                    ...doc.data()
                });
            });
            
            return notifications;
        } catch (error) {
            console.error('Error getting notifications:', error);
            return [];
        }
    }

    async markNotificationAsRead(notificationId) {
        if (!window.firebase) return false;

        try {
            const docRef = window.firebase.doc(window.firebase.db, this.collections.notifications, notificationId);
            await window.firebase.updateDoc(docRef, {
                read: true
            });
            return true;
        } catch (error) {
            console.error('Error marking notification as read:', error);
            return false;
        }
    }

    async saveTerritoriale(territorialeData) {
        if (!window.firebase) return false;

        try {
            const docRef = await window.firebase.addDoc(
                window.firebase.collection(window.firebase.db, this.collections.territoriali),
                {
                    ...territorialeData,
                    timestamp: window.firebase.serverTimestamp()
                }
            );
            return docRef.id;
        } catch (error) {
            console.error('Error saving territoriale:', error);
            return false;
        }
    }

    async updateTerritoriale(id, data) {
        if (!window.firebase) return false;

        try {
            const docRef = window.firebase.doc(window.firebase.db, this.collections.territoriali, id);
            await window.firebase.updateDoc(docRef, {
                ...data,
                lastUpdated: window.firebase.serverTimestamp()
            });
            return true;
        } catch (error) {
            console.error('Error updating territoriale:', error);
            return false;
        }
    }

    async saveLibraryFile(fileData, type) {
        if (!window.firebase) return false;

        try {
            const docRef = await window.firebase.addDoc(
                window.firebase.collection(window.firebase.db, this.collections.library),
                {
                    ...fileData,
                    type,
                    timestamp: window.firebase.serverTimestamp(),
                    visible: true
                }
            );
            return docRef.id;
        } catch (error) {
            console.error('Error saving library file:', error);
            return false;
        }
    }

    async getLibraryFiles(type = null) {
        if (!window.firebase) return [];

        try {
            let q = window.firebase.collection(window.firebase.db, this.collections.library);
            
            if (type) {
                q = window.firebase.query(q, 
                    window.firebase.where('type', '==', type),
                    window.firebase.where('visible', '==', true),
                    window.firebase.orderBy('timestamp', 'desc')
                );
            } else {
                q = window.firebase.query(q, 
                    window.firebase.where('visible', '==', true),
                    window.firebase.orderBy('timestamp', 'desc')
                );
            }

            const querySnapshot = await window.firebase.getDocs(q);
            const files = [];
            
            querySnapshot.forEach((doc) => {
                files.push({
                    id: doc.id,
                    ...doc.data()
                });
            });
            
            return files;
        } catch (error) {
            console.error('Error getting library files:', error);
            return [];
        }
    }

    async deleteLibraryFile(fileId) {
        if (!window.firebase) return false;

        try {
            const docRef = window.firebase.doc(window.firebase.db, this.collections.library, fileId);
            await window.firebase.updateDoc(docRef, {
                visible: false,
                deletedAt: window.firebase.serverTimestamp()
            });
            return true;
        } catch (error) {
            console.error('Error deleting library file:', error);
            return false;
        }
    }
}

// ==================== ENHANCED UPLOAD SYSTEM WITH FIREBASE ====================
class FirebaseUploadSystem extends UploadSystem {
    constructor() {
        super();
        this.storageManager = new FirebaseStorageManager();
        this.dbManager = new FirebaseDatabaseManager();
        this.adminAuth = new FirebaseAdminAuth();
    }

    async uploadFiles(section, files, fileType) {
        const maxFiles = section === 'talk' || section === 'alison' ? 15 : 2;
        
        if (files.length > maxFiles) {
            alert(`Massimo ${maxFiles} file per questa sezione`);
            return;
        }

        // Show loading
        const uploadBtn = document.getElementById(`${section}-upload-btn`);
        const originalText = uploadBtn.textContent;
        uploadBtn.textContent = 'Caricamento...';
        uploadBtn.disabled = true;

        try {
            const uploadPromises = Array.from(files).map(async (file) => {
                const uploadResult = await this.storageManager.uploadFile(
                    file, 
                    'sections', 
                    section
                );
                
                // Save to database
                await this.dbManager.saveLibraryFile({
                    ...uploadResult,
                    section,
                    fileType
                }, fileType);
                
                return uploadResult;
            });

            const results = await Promise.all(uploadPromises);
            
            // Update display
            await this.displayMediaFromFirebase(section);
            
            // Clear inputs
            document.getElementById(`${section}-file-input`).value = '';
            document.getElementById(`${section}-file-type`).value = '';
            
            alert(`${results.length} file caricati con successo!`);
            
        } catch (error) {
            console.error('Upload error:', error);
            alert('Errore durante il caricamento: ' + error.message);
        } finally {
            // Restore button
            uploadBtn.textContent = originalText;
            uploadBtn.disabled = false;
        }
    }

    async displayMediaFromFirebase(section) {
        const mediaGallery = document.getElementById(`${section}-media-gallery`);
        if (!mediaGallery) return;

        try {
            // Get files from Firebase
            const files = await this.storageManager.listFiles(`sections/${section}`);
            
            mediaGallery.innerHTML = '';
            
            if (files.length === 0) {
                mediaGallery.innerHTML = '<p class="no-content">Nessun file caricato</p>';
                return;
            }
            
            files.forEach((file) => {
                const mediaItem = document.createElement('div');
                mediaItem.className = 'media-item';
                
                const isVideo = file.name.match(/\.(mp4|avi|mov|wmv)$/i);
                const isImage = file.name.match(/\.(jpg|jpeg|png|gif|webp)$/i);
                
                if (isImage) {
                    mediaItem.innerHTML = `
                        <img src="${file.url}" alt="${file.name}" loading="lazy">
                        <div class="media-type">FOTO</div>
                    `;
                } else if (isVideo) {
                    mediaItem.innerHTML = `
                        <video src="${file.url}" controls preload="metadata"></video>
                        <div class="media-type">VIDEO</div>
                    `;
                } else {
                    mediaItem.innerHTML = `
                        <div class="file-item">${file.name}</div>
                        <div class="media-type">FILE</div>
                    `;
                }
                
                mediaItem.addEventListener('click', () => {
                    if (isImage || isVideo) {
                        this.openMediaModal(file.url, isVideo);
                    }
                });
                
                mediaGallery.appendChild(mediaItem);
            });
            
        } catch (error) {
            console.error('Error displaying media:', error);
            mediaGallery.innerHTML = '<p class="error">Errore nel caricamento dei file</p>';
        }
    }
}

// ==================== ENHANCED ADMIN PANEL WITH FIREBASE ====================
class FirebaseAdminPanel extends AdminPanel {
    constructor() {
        super();
        this.dbManager = new FirebaseDatabaseManager();
        this.storageManager = new FirebaseStorageManager();
        this.adminAuth = new FirebaseAdminAuth();
    }

    async login() {
        const password = this.passwordInput.value;
        const verification = this.verificationInput.value;
        
        const success = await this.adminAuth.authenticateAdmin(password, verification);
        
        if (success) {
            this.isLoggedIn = true;
            this.loginContainer.classList.add('hidden');
            this.adminPanel.classList.remove('hidden');
            
            // Load real-time data
            await this.loadFirebaseData();
        } else {
            alert('Credenziali non valide');
        }
    }

    async loadFirebaseData() {
        try {
            // Load notifications
            await this.loadFirebaseNotifications();
            
            // Load forms
            await this.loadFirebaseForms();
            
            // Load library files
            await this.loadFirebaseLibrary();
            
        } catch (error) {
            console.error('Error loading Firebase data:', error);
        }
    }

    async loadFirebaseNotifications() {
        try {
            const notifications = await this.dbManager.getNotifications();
            this.renderNotifications(notifications);
        } catch (error) {
            console.error('Error loading notifications:', error);
        }
    }

    async loadFirebaseForms() {
        const categorySelect = document.getElementById('user-category-select');
        const usersList = document.getElementById('users-list');
        
        if (!categorySelect || !usersList) return;
        
        categorySelect.addEventListener('change', async () => {
            const category = categorySelect.value;
            if (!category) {
                usersList.innerHTML = '';
                return;
            }
            
            try {
                const forms = await this.dbManager.getForms(category);
                this.renderForms(forms, usersList);
            } catch (error) {
                console.error('Error loading forms:', error);
                usersList.innerHTML = '<p class="error">Errore nel caricamento dei dati</p>';
            }
        });
    }

    renderForms(forms, container) {
        container.innerHTML = '';
        
        if (forms.length === 0) {
            container.innerHTML = '<p>Nessun utente registrato in questa categoria</p>';
            return;
        }
        
        forms.forEach(form => {
            const userCard = document.createElement('div');
            userCard.className = 'user-card';
            
            const timestamp = form.timestamp?.toDate ? 
                form.timestamp.toDate().toLocaleDateString() : 
                new Date(form.timestamp).toLocaleDateString();
            
            userCard.innerHTML = `
                <h5>${form.nome} ${form.cognome}</h5>
                <p>Email: ${form.email}</p>
                <p>Telefono: ${form.telefono || 'N/A'}</p>
                <p>Città: ${form.citta || 'N/A'}</p>
                <p>Data: ${timestamp}</p>
                <p>Status: <span class="status-${form.status}">${form.status}</span></p>
            `;
            container.appendChild(userCard);
        });
    }

    renderNotifications(notifications) {
        const notificheList = document.getElementById('notifiche-list');
        const nonLetteCount = document.getElementById('notifiche-non-lette');
        const totaliCount = document.getElementById('notifiche-totali');
        const oggiCount = document.getElementById('notifiche-oggi');
        
        if (!notificheList) return;
        
        // Update counters
        const nonLette = notifications.filter(n => !n.read).length;
        const oggi = notifications.filter(n => {
            const today = new Date().toDateString();
            const notifDate = n.timestamp?.toDate ? 
                n.timestamp.toDate().toDateString() : 
                new Date(n.timestamp).toDateString();
            return today === notifDate;
        }).length;
        
        if (nonLetteCount) nonLetteCount.textContent = nonLette;
        if (totaliCount) totaliCount.textContent = notifications.length;
        if (oggiCount) oggiCount.textContent = oggi;
        
        // Render notifications
        notificheList.innerHTML = '';
        
        if (notifications.length === 0) {
            notificheList.innerHTML = '<p>Nessuna notifica</p>';
            return;
        }
        
        notifications.forEach(notification => {
            const notifItem = document.createElement('div');
            notifItem.className = `notification-item ${notification.read ? 'read' : 'unread'}`;
            
            const timestamp = notification.timestamp?.toDate ? 
                notification.timestamp.toDate().toLocaleString() : 
                new Date(notification.timestamp).toLocaleString();
            
            notifItem.innerHTML = `
                <div class="notification-header">
                    <strong>${notification.message}</strong>
                    <span class="notification-time">${timestamp}</span>
                </div>
                <div class="notification-data">${JSON.stringify(notification.data, null, 2)}</div>
                ${!notification.read ? `<button onclick="adminPanel.markAsRead('${notification.id}')" class="mark-read-btn">Segna come letta</button>` : ''}
            `;
            notificheList.appendChild(notifItem);
        });
    }

    async markAsRead(notificationId) {
        try {
            await this.dbManager.markNotificationAsRead(notificationId);
            await this.loadFirebaseNotifications(); // Refresh
        } catch (error) {
            console.error('Error marking as read:', error);
        }
    }

    async loadFirebaseLibrary() {
        ['foto', 'video', 'testi', 'pdf'].forEach(async (type) => {
            try {
                const files = await this.dbManager.getLibraryFiles(type);
                this.renderFirebaseLibraryGrid(type, files);
                this.updateHomeLibraryDisplay(type, files);
            } catch (error) {
                console.error(`Error loading ${type} library:`, error);
            }
        });
    }

    renderFirebaseLibraryGrid(type, files) {
        const grid = document.getElementById(`${type}-library-grid`);
        if (!grid) return;
        
        grid.innerHTML = '';
        
        if (files.length === 0) {
            grid.innerHTML = '<p class="no-content">Nessun file caricato</p>';
            return;
        }
        
        files.forEach(file => {
            const item = document.createElement('div');
            item.className = 'library-item';
            
            let preview = '';
            if (file.type && file.type.startsWith('image/')) {
                preview = `<img src="${file.url}" alt="${file.originalName}" loading="lazy">`;
            } else if (file.type && file.type.startsWith('video/')) {
                preview = `<video src="${file.url}" controls preload="metadata"></video>`;
            } else {
                preview = `<div class="file-preview">${file.originalName || file.name}</div>`;
            }
            
            item.innerHTML = `
                ${preview}
                <div class="file-info">${file.originalName || file.name}</div>
                <button class="delete-file-btn" onclick="adminPanel.deleteFirebaseFile('${file.id}', '${type}')">×</button>
            `;
            
            grid.appendChild(item);
        });
    }

    async deleteFirebaseFile(fileId, type) {
        if (!confirm('Sei sicuro di voler eliminare questo file?')) return;
        
        try {
            await this.dbManager.deleteLibraryFile(fileId);
            await this.loadFirebaseLibrary(); // Refresh
            alert('File eliminato con successo');
        } catch (error) {
            console.error('Error deleting file:', error);
            alert('Errore durante l\'eliminazione del file');
        }
    }

    updateHomeLibraryDisplay(type, files) {
        const homeGrid = document.getElementById(`${type}-grid`);
        if (!homeGrid) return;
        
        homeGrid.innerHTML = '';
        
        if (files.length === 0) {
            homeGrid.innerHTML = `<p class="no-content">Nessun ${type} caricato. I file vengono caricati dal Panel Admin.</p>`;
            return;
        }
        
        files.forEach(file => {
            const item = document.createElement('div');
            item.className = 'media-item';
            
            if (file.type && file.type.startsWith('image/')) {
                item.innerHTML = `<img src="${file.url}" alt="${file.originalName}" loading="lazy">`;
            } else if (file.type && file.type.startsWith('video/')) {
                item.innerHTML = `<video src="${file.url}" controls preload="metadata"></video>`;
            } else {
                item.innerHTML = `<div class="file-item">${file.originalName || file.name}</div>`;
            }
            
            item.addEventListener('click', () => {
                if (file.type && (file.type.startsWith('image/') || file.type.startsWith('video/'))) {
                    this.openMediaModal(file.url, file.type.startsWith('video/'));
                }
            });
            
            homeGrid.appendChild(item);
        });
    }

    openMediaModal(src, isVideo) {
        const modal = document.getElementById('media-modal');
        const modalMedia = document.getElementById('modal-media');
        
        const mediaElement = isVideo ? 'video' : 'img';
        const controls = isVideo ? 'controls autoplay' : '';
        
        modalMedia.innerHTML = `<${mediaElement} src="${src}" ${controls}></${mediaElement}>`;
        modal.classList.remove('hidden');
    }
}

// ==================== ENHANCED FORM HANDLERS WITH FIREBASE ====================
class FirebaseFormHandlers extends FormHandlers {
    constructor() {
        super();
        this.dbManager = new FirebaseDatabaseManager();
    }

    async handleFormSubmit(e, formId) {
        e.preventDefault();
        
        const formData = new FormData(e.target);
        const data = Object.fromEntries(formData.entries());
        const formType = formId.replace('-form', '');
        
        // Show loading
        const submitBtn = e.target.querySelector('button[type="submit"]');
        const originalText = submitBtn.textContent;
        submitBtn.textContent = 'Invio in corso...';
        submitBtn.disabled = true;
        
        try {
            // Save to Firebase
            const docId = await this.dbManager.saveForm(data, formType);
            
            if (docId) {
                alert('Dati inviati con successo! Riceverai una conferma via email.');
                e.target.reset();
            } else {
                throw new Error('Errore durante il salvataggio');
            }
            
        } catch (error) {
            console.error('Form submission error:', error);
            alert('Errore durante l\'invio. Riprova più tardi.');
        } finally {
            // Restore button
            submitBtn.textContent = originalText;
            submitBtn.disabled = false;
        }
    }
}

// ==================== INITIALIZE FIREBASE INTEGRATION ====================
window.initializeFirebaseIntegration = function() {
    if (!window.firebase) {
        console.error('Firebase not loaded');
        return;
    }
    
    // Replace original classes with Firebase-enhanced versions
    window.firebaseUploadSystem = new FirebaseUploadSystem();
    window.firebaseAdminPanel = new FirebaseAdminPanel();
    window.firebaseFormHandlers = new FirebaseFormHandlers();
    
    // Make Firebase admin panel globally accessible
    window.adminPanel = window.firebaseAdminPanel;
    
    console.log('🔥 Firebase integration initialized successfully');
    console.log('📊 Real-time database connected');
    console.log('📁 Cloud storage ready');
    console.log('🔐 Authentication system active');
};

// Auto-initialize when Firebase is ready
if (window.firebase) {
    window.initializeFirebaseIntegration();
} else {
    // Wait for Firebase to load
    const checkFirebase = setInterval(() => {
        if (window.firebase) {
            clearInterval(checkFirebase);
            window.initializeFirebaseIntegration();
        }
    }, 100);
}