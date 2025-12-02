// ============================================================
// VALO MARKET - Main Application
// ============================================================
// Firebase is initialized in firebase-config.js
// Variables available: auth, db, storage

let currentUser = null;
let isAdmin = false;
let allListings = [];

// ============================================================
// Initialize
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
    console.log('🎮 VALO MARKET Started');
    initAuth();
    loadListings();
    updateStats();
    initSecretAdminAccess();
    
    // Check URL for admin access
    if (window.location.hash === '#admin' || window.location.pathname.includes('/admin')) {
        showAdminLogin();
    }
});

// Secret Admin Access - Ctrl+Shift+A or URL /admin or #admin
function initSecretAdminAccess() {
    document.addEventListener('keydown', (e) => {
        if (e.ctrlKey && e.shiftKey && e.key === 'A') {
            e.preventDefault();
            showAdminLogin();
        }
    });
}

function initAuth() {
    auth.onAuthStateChanged(async (user) => {
        if (user) {
            await loadUserData(user);
        } else {
            currentUser = null;
            updateUIForGuest();
        }
    });
}

async function loadUserData(firebaseUser) {
    try {
        const userDoc = await db.collection('users').doc(firebaseUser.uid).get();
        if (userDoc.exists) {
            currentUser = { id: firebaseUser.uid, ...userDoc.data() };
        } else {
            const newUser = {
                username: firebaseUser.displayName || 'User' + Date.now().toString().slice(-4),
                email: firebaseUser.email || '',
                phone: '',
                avatar: firebaseUser.photoURL || 'https://ui-avatars.com/api/?name=User&background=ff4655&color=fff',
                coins: 100,
                membership: { tier: 'none' },
                stats: { totalSales: 0, totalPurchases: 0, rating: 0 },
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            };
            await db.collection('users').doc(firebaseUser.uid).set(newUser);
            currentUser = { id: firebaseUser.uid, ...newUser };
            showToast('ยินดีต้อนรับ! ได้รับ 100 Coins ฟรี', 'success');
        }
        updateUIForUser();
    } catch (e) {
        console.error('Load user error:', e);
    }
}

function updateUIForUser() {
    document.getElementById('btnAuth').style.display = 'none';
    document.getElementById('userMenu').style.display = 'flex';
    document.getElementById('coinsDisplay').style.display = 'flex';
    document.getElementById('userName').textContent = currentUser?.username || 'User';
    document.getElementById('userCoins').textContent = (currentUser?.coins || 0).toLocaleString();
    if (currentUser?.avatar) document.getElementById('userAvatar').src = currentUser.avatar;
    // Show chat widget for logged in users
    document.getElementById('chatWidget').style.display = 'block';
    loadUserChatMessages();
}

function updateUIForGuest() {
    document.getElementById('btnAuth').style.display = 'block';
    document.getElementById('userMenu').style.display = 'none';
    document.getElementById('coinsDisplay').style.display = 'none';
    document.getElementById('chatWidget').style.display = 'none';
}

// ============================================================
// Google Login
// ============================================================
async function loginWithGoogle() {
    try {
        const provider = new firebase.auth.GoogleAuthProvider();
        await auth.signInWithPopup(provider);
        closeModal('authModal');
        showToast('เข้าสู่ระบบสำเร็จ!', 'success');
    } catch (e) {
        showToast('เกิดข้อผิดพลาด: ' + e.message, 'error');
    }
}

// ============================================================
// Email/Password Login & Register
// ============================================================
async function loginWithEmail() {
    const usernameOrEmail = document.getElementById('loginUsername').value.trim();
    const password = document.getElementById('loginPassword').value;
    
    if (!usernameOrEmail || !password) {
        showToast('กรุณากรอกข้อมูลให้ครบ', 'error');
        return;
    }
    
    try {
        // Check if input is email or username
        let email = usernameOrEmail;
        
        // If not email format, search by username
        if (!usernameOrEmail.includes('@')) {
            const userSnap = await db.collection('users').where('username', '==', usernameOrEmail).get();
            if (userSnap.empty) {
                showToast('ไม่พบ Username นี้', 'error');
                return;
            }
            email = userSnap.docs[0].data().email;
        }
        
        // Login with Firebase Auth
        await auth.signInWithEmailAndPassword(email, password);
        closeModal('authModal');
        showToast('เข้าสู่ระบบสำเร็จ!', 'success');
        
        // Clear form
        document.getElementById('loginUsername').value = '';
        document.getElementById('loginPassword').value = '';
    } catch (e) {
        console.error('Login error:', e);
        if (e.code === 'auth/user-not-found') {
            showToast('ไม่พบบัญชีนี้', 'error');
        } else if (e.code === 'auth/wrong-password') {
            showToast('รหัสผ่านไม่ถูกต้อง', 'error');
        } else if (e.code === 'auth/invalid-email') {
            showToast('รูปแบบ Email ไม่ถูกต้อง', 'error');
        } else {
            showToast('เกิดข้อผิดพลาด: ' + e.message, 'error');
        }
    }
}

async function registerWithEmail() {
    const email = document.getElementById('registerEmail').value.trim();
    const username = document.getElementById('registerUsername').value.trim();
    const password = document.getElementById('registerPassword').value;
    const confirmPassword = document.getElementById('registerConfirmPassword').value;
    
    // Validation
    if (!email || !username || !password || !confirmPassword) {
        showToast('กรุณากรอกข้อมูลให้ครบ', 'error');
        return;
    }
    
    if (!email.includes('@')) {
        showToast('รูปแบบ Email ไม่ถูกต้อง', 'error');
        return;
    }
    
    if (username.length < 3) {
        showToast('Username ต้องมีอย่างน้อย 3 ตัวอักษร', 'error');
        return;
    }
    
    if (password.length < 6) {
        showToast('รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร', 'error');
        return;
    }
    
    if (password !== confirmPassword) {
        showToast('รหัสผ่านไม่ตรงกัน', 'error');
        return;
    }
    
    try {
        // Check if username already exists
        const existingUser = await db.collection('users').where('username', '==', username).get();
        if (!existingUser.empty) {
            showToast('Username นี้ถูกใช้แล้ว', 'error');
            return;
        }
        
        // Create user with Firebase Auth
        const userCredential = await auth.createUserWithEmailAndPassword(email, password);
        const user = userCredential.user;
        
        // Update display name
        await user.updateProfile({ displayName: username });
        
        // Create user document in Firestore
        await db.collection('users').doc(user.uid).set({
            username,
            email,
            avatar: 'https://ui-avatars.com/api/?name=' + encodeURIComponent(username) + '&background=ff4655&color=fff',
            coins: 100,
            membership: { tier: 'none' },
            stats: { totalSales: 0, totalPurchases: 0, rating: 0 },
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        closeModal('authModal');
        showToast('สมัครสมาชิกสำเร็จ! ได้รับ 100 Coins ฟรี', 'success');
        
        // Clear form
        document.getElementById('registerEmail').value = '';
        document.getElementById('registerUsername').value = '';
        document.getElementById('registerPassword').value = '';
        document.getElementById('registerConfirmPassword').value = '';
    } catch (e) {
        console.error('Register error:', e);
        if (e.code === 'auth/email-already-in-use') {
            showToast('Email นี้ถูกใช้แล้ว', 'error');
        } else if (e.code === 'auth/invalid-email') {
            showToast('รูปแบบ Email ไม่ถูกต้อง', 'error');
        } else if (e.code === 'auth/weak-password') {
            showToast('รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร', 'error');
        } else {
            showToast('เกิดข้อผิดพลาด: ' + e.message, 'error');
        }
    }
}

function logout() {
    auth.signOut();
    currentUser = null;
    isAdmin = false;
    updateUIForGuest();
    showPage('home');
    showToast('ออกจากระบบแล้ว', 'success');
}

// ============================================================
// Listings
// ============================================================
async function loadListings() {
    try {
        // Get all approved listings (simpler query to avoid index requirement)
        const snap = await db.collection('listings').where('status', '==', 'approved').get();
        allListings = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        
        // Sort by createdAt on client side
        allListings.sort((a, b) => {
            const dateA = a.createdAt?.toDate?.() || new Date(0);
            const dateB = b.createdAt?.toDate?.() || new Date(0);
            return dateB - dateA;
        });
        
        console.log('Loaded ' + allListings.length + ' listings from Firebase');
    } catch (e) {
        console.log('Loading sample listings, error:', e.message);
        allListings = getSampleListings();
    }
    if (allListings.length === 0) allListings = getSampleListings();
    renderListings(allListings);
}

function getSampleListings() {
    return [
        { id: '1', title: 'Radiant 85 Skins', rank: 'radiant', skins: 85, price: 12500, featuredSkins: 'Elderflame Vandal, Champions Phantom', status: 'approved', sellerId: 'sample', sellerName: 'ProGamer', contact: { line: 'progamer99' }, image: 'https://images.unsplash.com/photo-1542751371-adc38448a05e?w=400' },
        { id: '2', title: 'Immortal 50 Skins', rank: 'immortal', skins: 50, price: 8900, featuredSkins: 'Reaver Vandal, Glitchpop Phantom', status: 'approved', sellerId: 'sample', sellerName: 'ValoKing', contact: { discord: 'ValoKing#1234' }, image: 'https://images.unsplash.com/photo-1538481199705-c710c4e965fc?w=400' },
        { id: '3', title: 'Diamond 30 Skins', rank: 'diamond', skins: 30, price: 3500, featuredSkins: 'Prime Vandal', status: 'approved', sellerId: 'sample', sellerName: 'SkinLover', contact: { facebook: 'SkinLover' }, image: 'https://images.unsplash.com/photo-1493711662062-fa541f7f3d24?w=400' },
        { id: '4', title: 'Ascendant 45 Skins', rank: 'ascendant', skins: 45, price: 5500, featuredSkins: 'Oni Phantom, Singularity Sheriff', status: 'approved', sellerId: 'sample', sellerName: 'RankMaster', contact: { line: 'rankmaster' }, image: 'https://images.unsplash.com/photo-1511512578047-dfb367046420?w=400' },
        { id: '5', title: 'Platinum 15 Skins', rank: 'platinum', skins: 15, price: 1800, featuredSkins: 'Recon Phantom', status: 'approved', sellerId: 'sample', sellerName: 'NewPlayer', contact: { discord: 'NewPlayer#5555' }, image: 'https://images.unsplash.com/photo-1552820728-8b83bb6b2b0b?w=400' },
        { id: '6', title: 'Gold 5 Skins', rank: 'gold', skins: 5, price: 800, featuredSkins: 'Prime Classic', status: 'approved', sellerId: 'sample', sellerName: 'Starter', contact: { phone: '0891234567' }, image: 'https://images.unsplash.com/photo-1560253023-3ec5d502959f?w=400' }
    ];
}

function renderListings(listings) {
    const grid = document.getElementById('listingsGrid');
    if (!grid) return;
    if (listings.length === 0) {
        grid.innerHTML = '<p class="empty">ไม่พบประกาศ</p>';
        return;
    }
    grid.innerHTML = listings.map(l => `
        <div class="listing-card" onclick="viewListing('${l.id}')">
            <div class="listing-image"><img src="${l.image || 'https://via.placeholder.com/300x200'}" alt="${l.title}"></div>
            <div class="listing-badge ${l.rank}">${getRankName(l.rank)}</div>
            <div class="listing-info">
                <h3>${l.title}</h3>
                <p class="skins"><i class="fas fa-palette"></i> ${l.skins} Skins</p>
                <p class="featured">${l.featuredSkins || ''}</p>
                <div class="listing-footer">
                    <span class="price">฿${l.price.toLocaleString()}</span>
                    <button class="btn-buy" onclick="event.stopPropagation();showPurchaseModal('${l.id}')"><i class="fas fa-shopping-cart"></i></button>
                </div>
            </div>
        </div>
    `).join('');
}

function getRankName(rank) {
    const names = { radiant: 'Radiant', immortal: 'Immortal', ascendant: 'Ascendant', diamond: 'Diamond', platinum: 'Platinum', gold: 'Gold', silver: 'Silver', bronze: 'Bronze', iron: 'Iron' };
    return names[rank] || rank;
}

function filterListings() {
    const search = document.getElementById('searchInput')?.value.toLowerCase() || '';
    const price = document.getElementById('filterPrice')?.value || '';
    const rank = document.getElementById('filterRank')?.value || '';
    const skins = document.getElementById('filterSkins')?.value || '';
    
    let filtered = allListings.filter(l => {
        if (search && !l.title.toLowerCase().includes(search) && !(l.featuredSkins || '').toLowerCase().includes(search)) return false;
        if (rank && l.rank !== rank) return false;
        if (price) {
            const [min, max] = price.split('-').map(Number);
            if (l.price < min || l.price > max) return false;
        }
        if (skins) {
            const [min, max] = skins.split('-').map(Number);
            if (l.skins < min || l.skins > max) return false;
        }
        return true;
    });
    renderListings(filtered);
}

function resetFilters() {
    document.getElementById('searchInput').value = '';
    document.getElementById('filterPrice').value = '';
    document.getElementById('filterRank').value = '';
    document.getElementById('filterSkins').value = '';
    renderListings(allListings);
}

function viewListing(id) {
    const listing = allListings.find(l => l.id === id);
    if (!listing) return;
    
    document.getElementById('listingDetailContent').innerHTML = `
        <button class="back-btn" onclick="showPage('marketplace')"><i class="fas fa-arrow-left"></i> กลับ</button>
        <div class="detail-grid">
            <div class="detail-image"><img src="${listing.image || 'https://via.placeholder.com/500'}" alt="${listing.title}"></div>
            <div class="detail-info">
                <span class="rank-badge ${listing.rank}">${getRankName(listing.rank)}</span>
                <h1>${listing.title}</h1>
                <p class="skins-count"><i class="fas fa-palette"></i> ${listing.skins} Skins</p>
                <p class="featured-skins">${listing.featuredSkins || '-'}</p>
                <p class="highlights">${listing.highlights || ''}</p>
                <div class="price-box"><span class="price">฿${listing.price.toLocaleString()}</span></div>
                <button class="btn-primary btn-large" onclick="showPurchaseModal('${listing.id}')"><i class="fas fa-shopping-cart"></i> ซื้อเลย</button>
                <div class="seller-info"><p><i class="fas fa-user"></i> ผู้ขาย: ${listing.sellerName || 'Unknown'}</p></div>
            </div>
        </div>
    `;
    showPage('listing-detail');
}

// ============================================================
// Sell Listing
// ============================================================
function selectSellOption(type, el) {
    document.querySelectorAll('.sell-option').forEach(o => o.classList.remove('selected'));
    el.classList.add('selected');
    document.getElementById('sellType').value = type;
}

// Store uploaded images temporarily
let uploadedImages = [];

async function submitListing(e) {
    e.preventDefault();
    if (!currentUser) {
        showToast('กรุณาเข้าสู่ระบบก่อน', 'error');
        showAuthModal();
        return;
    }
    
    const gameUsername = document.getElementById('gameUsername').value.trim();
    const gamePassword = document.getElementById('gamePassword').value.trim();
    const rank = document.getElementById('listingRank').value;
    const skins = parseInt(document.getElementById('listingSkins').value) || 0;
    const price = parseInt(document.getElementById('listingPrice').value) || 0;
    const featuredSkins = document.getElementById('listingFeaturedSkins').value;
    const highlights = document.getElementById('listingHighlights').value;
    const sellType = document.getElementById('sellType').value;
    
    // Validation
    if (!gameUsername || !gamePassword) {
        showToast('กรุณากรอก Riot ID และ Password', 'error');
        return;
    }
    
    if (!rank) {
        showToast('กรุณาเลือก Rank', 'error');
        return;
    }
    
    if (price < 100) {
        showToast('ราคาขั้นต่ำ 100 บาท', 'error');
        return;
    }
    
    const contact = {
        facebook: document.getElementById('contactFacebook').value.trim(),
        line: document.getElementById('contactLine').value.trim(),
        discord: document.getElementById('contactDiscord').value.trim(),
        phone: document.getElementById('contactPhoneSell').value.trim()
    };
    
    if (!contact.facebook && !contact.line && !contact.discord && !contact.phone) {
        showToast('กรุณากรอกช่องทางติดต่ออย่างน้อย 1 ช่อง', 'error');
        return;
    }
    
    // Show loading
    showToast('กำลังอัพโหลด...', 'info');
    
    // Upload images to Firebase Storage
    let imageUrl = '';
    let imageUrls = [];
    const fileInput = document.getElementById('listingImages');
    
    if (fileInput.files.length > 0) {
        try {
            for (let i = 0; i < Math.min(fileInput.files.length, 5); i++) {
                const file = fileInput.files[i];
                const fileName = `listings/${currentUser.id}/${Date.now()}_${i}.${file.name.split('.').pop()}`;
                const storageRef = storage.ref(fileName);
                
                const snapshot = await storageRef.put(file);
                const url = await snapshot.ref.getDownloadURL();
                imageUrls.push(url);
            }
            imageUrl = imageUrls[0];
        } catch (uploadError) {
            console.error('Upload error:', uploadError);
            showToast('อัพโหลดรูปไม่สำเร็จ ใช้รูปเริ่มต้น', 'warning');
            imageUrl = getDefaultImage(rank);
        }
    } else {
        imageUrl = getDefaultImage(rank);
    }
    
    const listing = {
        title: `${getRankName(rank)} ${skins} Skins`,
        rank, 
        skins, 
        price, 
        featuredSkins, 
        highlights, 
        contact, 
        sellType,
        gameCredentials: {
            username: gameUsername,
            password: gamePassword
        },
        sellerId: currentUser.id,
        sellerName: currentUser.username,
        sellerAvatar: currentUser.avatar || '',
        status: 'pending',
        image: imageUrl,
        images: imageUrls.length > 0 ? imageUrls : [imageUrl],
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    
    try {
        await db.collection('listings').add(listing);
        showToast('ส่งประกาศแล้ว รอแอดมินอนุมัติ', 'success');
        document.getElementById('sellForm').reset();
        document.getElementById('imagePreviews').innerHTML = '';
        document.getElementById('uploadPlaceholder').style.display = 'block';
        uploadedImages = [];
        showPage('dashboard');
    } catch (e) {
        console.error('Submit error:', e);
        showToast('เกิดข้อผิดพลาด: ' + e.message, 'error');
    }
}

// Get default image based on rank
function getDefaultImage(rank) {
    const images = {
        radiant: 'https://images.unsplash.com/photo-1542751371-adc38448a05e?w=400',
        immortal: 'https://images.unsplash.com/photo-1538481199705-c710c4e965fc?w=400',
        ascendant: 'https://images.unsplash.com/photo-1493711662062-fa541f7f3d24?w=400',
        diamond: 'https://images.unsplash.com/photo-1511512578047-dfb367046420?w=400',
        platinum: 'https://images.unsplash.com/photo-1552820728-8b83bb6b2b0b?w=400',
        gold: 'https://images.unsplash.com/photo-1560253023-3ec5d502959f?w=400',
        silver: 'https://images.unsplash.com/photo-1542751110-97427bbecf20?w=400',
        bronze: 'https://images.unsplash.com/photo-1509198397868-475647b2a1e5?w=400',
        iron: 'https://images.unsplash.com/photo-1493711662062-fa541f7f3d24?w=400'
    };
    return images[rank] || images.gold;
}

function previewImages(e) {
    const files = e.target.files;
    const preview = document.getElementById('imagePreviews');
    const placeholder = document.getElementById('uploadPlaceholder');
    preview.innerHTML = '';
    if (files.length > 0) {
        placeholder.style.display = 'none';
        Array.from(files).slice(0, 5).forEach(file => {
            const reader = new FileReader();
            reader.onload = (ev) => {
                preview.innerHTML += `<div class="preview-item"><img src="${ev.target.result}"></div>`;
            };
            reader.readAsDataURL(file);
        });
    } else {
        placeholder.style.display = 'block';
    }
}

// ============================================================
// Purchase
// ============================================================
function showPurchaseModal(id) {
    if (!currentUser) {
        showToast('กรุณาเข้าสู่ระบบก่อน', 'error');
        showAuthModal();
        return;
    }
    const listing = allListings.find(l => l.id === id);
    if (!listing) return;
    
    document.getElementById('purchaseContent').innerHTML = `
        <button class="close-btn" onclick="closeModal('purchaseModal')">&times;</button>
        <h2><i class="fas fa-shopping-cart"></i> ยืนยันการซื้อ</h2>
        <div class="purchase-item">
            <img src="${listing.image || 'https://via.placeholder.com/100'}" alt="">
            <div><h3>${listing.title}</h3><p>${listing.skins} Skins</p></div>
        </div>
        <div class="purchase-summary">
            <div class="row"><span>ราคาไอดี</span><span>฿${listing.price.toLocaleString()}</span></div>
            <div class="row"><span>ประกันไอดี</span>
                <select id="insuranceSelect" onchange="updatePurchaseTotal(${listing.price})">
                    <option value="0">ไม่ต้องการ (฿0)</option>
                    <option value="50">3 วัน (฿50)</option>
                    <option value="100">7 วัน (฿100)</option>
                    <option value="300">30 วัน (฿300)</option>
                </select>
            </div>
            <hr>
            <div class="row total"><span>รวม</span><span id="purchaseTotal">฿${listing.price.toLocaleString()}</span></div>
            <div class="row balance"><span>Coins ของคุณ</span><span>${currentUser.coins.toLocaleString()} Coins</span></div>
        </div>
        <button class="btn-primary" onclick="confirmPurchase('${listing.id}')"><i class="fas fa-check"></i> ยืนยันซื้อ</button>
    `;
    openModal('purchaseModal');
}

function updatePurchaseTotal(price) {
    const insurance = parseInt(document.getElementById('insuranceSelect').value) || 0;
    document.getElementById('purchaseTotal').textContent = '฿' + (price + insurance).toLocaleString();
}

async function confirmPurchase(id) {
    const listing = allListings.find(l => l.id === id);
    if (!listing) {
        showToast('ไม่พบสินค้า', 'error');
        return;
    }
    
    if (!currentUser) {
        showToast('กรุณาเข้าสู่ระบบก่อน', 'error');
        closeModal('purchaseModal');
        showAuthModal();
        return;
    }
    
    const insurance = parseInt(document.getElementById('insuranceSelect')?.value) || 0;
    const total = listing.price + insurance;
    
    if ((currentUser.coins || 0) < total) {
        showToast('Coins ไม่เพียงพอ กรุณาเติมเงิน', 'error');
        closeModal('purchaseModal');
        showDepositModal();
        return;
    }
    
    // Get game credentials from listing (Admin กรอกไว้ตอนอนุมัติ)
    const credentials = listing.gameCredentials || {};
    
    try {
        // Deduct coins from buyer
        currentUser.coins -= total;
        await db.collection('users').doc(currentUser.id).update({ 
            coins: currentUser.coins 
        });
        
        // Add coins to seller (90% after 10% fee)
        const sellerAmount = Math.floor(listing.price * 0.9);
        if (listing.sellerId && listing.sellerId !== 'sample') {
            try {
                await db.collection('users').doc(listing.sellerId).update({ 
                    coins: firebase.firestore.FieldValue.increment(sellerAmount)
                });
            } catch (sellerError) {
                console.log('Could not update seller coins:', sellerError);
            }
        }
        
        // Record purchase with game credentials
        const purchaseData = {
            listingId: listing.id,
            listingTitle: listing.title,
            listingImage: listing.image || getDefaultImage(listing.rank),
            listingRank: listing.rank,
            listingSkins: listing.skins,
            buyerId: currentUser.id,
            buyerName: currentUser.username || 'User',
            sellerId: listing.sellerId || '',
            sellerName: listing.sellerName || 'Unknown',
            price: listing.price,
            insurance, 
            total,
            gameCredentials: credentials,
            status: 'completed',
            purchasedAt: firebase.firestore.FieldValue.serverTimestamp()
        };
        
        await db.collection('purchases').add(purchaseData);
        
        // Update listing status to sold
        try {
            await db.collection('listings').doc(id).update({ 
                status: 'sold',
                soldAt: firebase.firestore.FieldValue.serverTimestamp(),
                buyerId: currentUser.id
            });
        } catch (updateError) {
            console.log('Could not update listing status:', updateError);
        }
        
        // Remove from allListings
        allListings = allListings.filter(l => l.id !== id);
        renderListings(allListings);
        
        updateUIForUser();
        closeModal('purchaseModal');
        
        // Show credentials immediately
        showPurchaseSuccess(listing, credentials);
        
    } catch (e) {
        console.error('Purchase error:', e);
        
        // If Firestore fails, still show success in Demo mode
        if (e.code === 'permission-denied') {
            // Rollback coins locally
            currentUser.coins += total;
            
            showToast('⚠️ ต้องตั้งค่า Firestore Rules ก่อน - ดู Console', 'error');
            console.log(`
╔════════════════════════════════════════════════════════════════╗
║  ⚠️ FIRESTORE PERMISSION ERROR                                 ║
║                                                                ║
║  กรุณาไปที่ Firebase Console > Firestore Database > Rules     ║
║  แล้ววางโค้ดนี้:                                               ║
║                                                                ║
║  rules_version = '2';                                         ║
║  service cloud.firestore {                                    ║
║    match /databases/{database}/documents {                    ║
║      match /{document=**} {                                   ║
║        allow read, write: if true;                            ║
║      }                                                        ║
║    }                                                          ║
║  }                                                            ║
║                                                                ║
║  แล้วกด Publish                                               ║
╚════════════════════════════════════════════════════════════════╝
            `);
        } else {
            showToast('เกิดข้อผิดพลาด: ' + e.message, 'error');
        }
    }
}

function showPurchaseSuccess(listing, credentials) {
    const modal = document.getElementById('contactInfoModal');
    const content = document.getElementById('sellerContactDetails');
    
    content.innerHTML = `
        <div class="purchase-success-card">
            <div class="success-header">
                <i class="fas fa-check-circle"></i>
                <h3>ซื้อสำเร็จ!</h3>
            </div>
            <div class="purchased-item">
                <img src="${listing.image || getDefaultImage(listing.rank)}" alt="">
                <div>
                    <h4>${escapeHtml(listing.title)}</h4>
                    <p>${getRankName(listing.rank)} • ${listing.skins} Skins</p>
                </div>
            </div>
            <div class="credentials-card">
                <h4><i class="fas fa-key"></i> ข้อมูลเข้าเกม</h4>
                <div class="credential-item">
                    <label>Riot ID / Email</label>
                    <div class="credential-value">
                        <span id="credentialId">${credentials.id ? escapeHtml(credentials.id) : 'รอ Admin ส่งข้อมูล'}</span>
                        ${credentials.id ? `<button onclick="copyToClipboard('${credentials.id}')" title="คัดลอก"><i class="fas fa-copy"></i></button>` : ''}
                    </div>
                </div>
                <div class="credential-item">
                    <label>Password</label>
                    <div class="credential-value">
                        <span id="credentialPass">${credentials.password ? '••••••••' : 'รอ Admin ส่งข้อมูล'}</span>
                        ${credentials.password ? `
                            <button onclick="togglePassword(this, '${credentials.password}')" title="แสดง/ซ่อน"><i class="fas fa-eye"></i></button>
                            <button onclick="copyToClipboard('${credentials.password}')" title="คัดลอก"><i class="fas fa-copy"></i></button>
                        ` : ''}
                    </div>
                </div>
            </div>
            <p class="credentials-note"><i class="fas fa-info-circle"></i> กรุณาเปลี่ยนรหัสผ่านทันทีหลังเข้าสู่ระบบ</p>
        </div>
    `;
    
    openModal('contactInfoModal');
    showToast('ซื้อสำเร็จ! ดู ID/Password ได้ในประวัติการซื้อ', 'success');
}

function togglePassword(btn, password) {
    const span = btn.parentElement.querySelector('span');
    const icon = btn.querySelector('i');
    if (span.textContent === '••••••••') {
        span.textContent = password;
        icon.classList.remove('fa-eye');
        icon.classList.add('fa-eye-slash');
    } else {
        span.textContent = '••••••••';
        icon.classList.remove('fa-eye-slash');
        icon.classList.add('fa-eye');
    }
}

function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
        showToast('คัดลอกแล้ว', 'success');
    }).catch(() => {
        // Fallback
        const input = document.createElement('input');
        input.value = text;
        document.body.appendChild(input);
        input.select();
        document.execCommand('copy');
        document.body.removeChild(input);
        showToast('คัดลอกแล้ว', 'success');
    });
}

function showContactInfo(listing) {
    // Deprecated - now using showPurchaseSuccess
    const c = listing.contact || {};
    let html = '';
    if (c.facebook) html += `<p><i class="fab fa-facebook"></i> ${escapeHtml(c.facebook)}</p>`;
    if (c.line) html += `<p><i class="fab fa-line"></i> ${escapeHtml(c.line)}</p>`;
    if (c.discord) html += `<p><i class="fab fa-discord"></i> ${escapeHtml(c.discord)}</p>`;
    if (c.phone) html += `<p><i class="fas fa-phone"></i> ${escapeHtml(c.phone)}</p>`;
    document.getElementById('sellerContactDetails').innerHTML = html || '<p>ไม่พบข้อมูล</p>';
    openModal('contactInfoModal');
}

// ============================================================
// Deposit & Withdraw
// ============================================================
function showDepositModal() {
    if (!currentUser) {
        showToast('กรุณาเข้าสู่ระบบก่อน', 'error');
        showAuthModal();
        return;
    }
    openModal('depositModal');
}

function selectDepositAmount(amount, el) {
    document.querySelectorAll('.amount-btns button').forEach(b => b.classList.remove('selected'));
    el.classList.add('selected');
    document.getElementById('depositAmount').value = amount;
}

function processDeposit() {
    const amount = parseInt(document.getElementById('depositAmount').value);
    if (amount < 50) {
        showToast('ขั้นต่ำ 50 บาท', 'error');
        return;
    }
    const method = document.querySelector('input[name="paymentMethod"]:checked')?.value || 'promptpay';
    document.getElementById('paymentAmountDisplay').textContent = '฿' + amount.toLocaleString();
    document.getElementById('paymentMethodDisplay').textContent = method === 'promptpay' ? 'พร้อมเพย์' : method === 'truewallet' ? 'TrueMoney' : 'โอนธนาคาร';
    closeModal('depositModal');
    openModal('paymentQRModal');
}

function previewSlip(e) {
    const file = e.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = (ev) => {
            document.getElementById('slipPreview').innerHTML = `<img src="${ev.target.result}" style="max-width:200px">`;
        };
        reader.readAsDataURL(file);
    }
}

async function submitPaymentSlip() {
    const amount = parseInt(document.getElementById('depositAmount').value);
    try {
        await db.collection('deposits').add({
            userId: currentUser.id,
            amount,
            method: document.querySelector('input[name="paymentMethod"]:checked')?.value,
            status: 'pending',
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
    } catch (e) { console.log('Demo deposit'); }
    
    // Demo: Add coins immediately
    currentUser.coins += amount;
    try {
        await db.collection('users').doc(currentUser.id).update({ coins: currentUser.coins });
    } catch (e) {}
    updateUIForUser();
    closeModal('paymentQRModal');
    showToast(`เติม ${amount} Coins สำเร็จ! (Demo)`, 'success');
}

function showWithdrawModal() {
    if (!currentUser) {
        showToast('กรุณาเข้าสู่ระบบก่อน', 'error');
        showAuthModal();
        return;
    }
    document.getElementById('withdrawBalance').textContent = currentUser.coins.toLocaleString();
    openModal('withdrawModal');
}

function toggleBankFields() {
    const method = document.getElementById('withdrawMethod').value;
    const bankFields = document.getElementById('bankFields');
    const label = document.getElementById('accountLabel');
    if (method === 'bank') {
        bankFields.style.display = 'block';
        label.textContent = 'เลขบัญชี';
    } else {
        bankFields.style.display = 'none';
        label.textContent = method === 'promptpay' ? 'เบอร์พร้อมเพย์' : 'เบอร์ TrueMoney';
    }
}

async function processWithdraw() {
    const amount = parseInt(document.getElementById('withdrawAmount').value);
    if (!amount || amount < 100) {
        showToast('ขั้นต่ำ 100 Coins', 'error');
        return;
    }
    if (amount > currentUser.coins) {
        showToast('Coins ไม่เพียงพอ', 'error');
        return;
    }
    
    currentUser.coins -= amount;
    try {
        await db.collection('users').doc(currentUser.id).update({ coins: currentUser.coins });
        await db.collection('withdrawals').add({
            userId: currentUser.id,
            amount,
            method: document.getElementById('withdrawMethod').value,
            account: document.getElementById('withdrawAccount').value,
            status: 'pending',
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
    } catch (e) { console.log('Demo withdraw'); }
    
    updateUIForUser();
    closeModal('withdrawModal');
    showToast('ส่งคำขอถอนเงินแล้ว รอดำเนินการ', 'success');
}

// ============================================================
// Membership
// ============================================================
async function buyMembership(tier, price) {
    if (!currentUser) {
        showToast('กรุณาเข้าสู่ระบบก่อน', 'error');
        showAuthModal();
        return;
    }
    if (currentUser.coins < price) {
        showToast('Coins ไม่เพียงพอ', 'error');
        showDepositModal();
        return;
    }
    
    currentUser.coins -= price;
    currentUser.membership = { tier, expiresAt: new Date(Date.now() + 30*24*60*60*1000) };
    
    try {
        await db.collection('users').doc(currentUser.id).update({
            coins: currentUser.coins,
            membership: currentUser.membership
        });
    } catch (e) {}
    
    updateUIForUser();
    showToast(`สมัครสมาชิก ${tier.toUpperCase()} สำเร็จ!`, 'success');
}

// ============================================================
// Dashboard
// ============================================================
async function loadDashboardData() {
    if (!currentUser) return;
    document.getElementById('dashCoins').textContent = (currentUser.coins || 0).toLocaleString();
    document.getElementById('dashSales').textContent = currentUser.stats?.totalSales || 0;
    document.getElementById('dashPending').textContent = 0;
    document.getElementById('dashRating').textContent = currentUser.stats?.rating || '-';
    
    // Load purchases
    await loadUserPurchases();
    await loadUserSales();
    await loadUserTransactions();
}

async function loadUserPurchases() {
    const container = document.getElementById('purchasesList');
    if (!container) return;
    
    try {
        const snap = await db.collection('purchases')
            .where('buyerId', '==', currentUser.id)
            .get();
        
        const purchases = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        purchases.sort((a, b) => {
            const dateA = a.purchasedAt?.toDate?.() || new Date(0);
            const dateB = b.purchasedAt?.toDate?.() || new Date(0);
            return dateB - dateA;
        });
        
        if (purchases.length === 0) {
            container.innerHTML = '<p class="empty">ยังไม่มีการซื้อ</p>';
            return;
        }
        
        container.innerHTML = purchases.map(p => `
            <div class="purchase-history-item" onclick="showPurchaseDetail('${p.id}')">
                <img src="${p.listingImage || getDefaultImage(p.listingRank)}" alt="" onerror="this.src='${getDefaultImage(p.listingRank)}'">
                <div class="purchase-info">
                    <h4>${escapeHtml(p.listingTitle) || 'ID Valorant'}</h4>
                    <p>${getRankName(p.listingRank)} • ${p.listingSkins || 0} Skins</p>
                    <span class="purchase-date">${formatDate(p.purchasedAt)}</span>
                </div>
                <div class="purchase-price">฿${(p.total || p.price || 0).toLocaleString()}</div>
                <div class="purchase-status completed"><i class="fas fa-check-circle"></i> สำเร็จ</div>
                <button class="btn-view-credentials" onclick="event.stopPropagation();showPurchaseDetail('${p.id}')">
                    <i class="fas fa-key"></i> ดู ID
                </button>
            </div>
        `).join('');
    } catch (e) {
        console.error('Load purchases error:', e);
        container.innerHTML = '<p class="empty">เกิดข้อผิดพลาด</p>';
    }
}

async function showPurchaseDetail(purchaseId) {
    try {
        const doc = await db.collection('purchases').doc(purchaseId).get();
        if (!doc.exists) {
            showToast('ไม่พบข้อมูล', 'error');
            return;
        }
        
        const p = doc.data();
        const credentials = p.gameCredentials || {};
        
        const content = document.getElementById('sellerContactDetails');
        content.innerHTML = `
            <div class="purchase-detail-card">
                <div class="detail-header">
                    <img src="${p.listingImage || getDefaultImage(p.listingRank)}" alt="">
                    <div>
                        <h3>${escapeHtml(p.listingTitle) || 'ID Valorant'}</h3>
                        <p>${getRankName(p.listingRank)} • ${p.listingSkins || 0} Skins</p>
                        <span class="detail-date">ซื้อเมื่อ ${formatDate(p.purchasedAt)}</span>
                    </div>
                </div>
                <div class="detail-price">
                    <div class="row"><span>ราคา</span><span>฿${(p.price || 0).toLocaleString()}</span></div>
                    ${p.insurance ? `<div class="row"><span>ประกัน</span><span>฿${p.insurance.toLocaleString()}</span></div>` : ''}
                    <div class="row total"><span>รวม</span><span>฿${(p.total || p.price || 0).toLocaleString()}</span></div>
                </div>
                <div class="credentials-card">
                    <h4><i class="fas fa-key"></i> ข้อมูลเข้าเกม Valorant</h4>
                    <div class="credential-item">
                        <label>Riot ID / Email</label>
                        <div class="credential-value">
                            <span>${credentials.id ? escapeHtml(credentials.id) : 'ยังไม่มีข้อมูล - ติดต่อ Admin'}</span>
                            ${credentials.id ? `<button onclick="copyToClipboard('${credentials.id}')" title="คัดลอก"><i class="fas fa-copy"></i></button>` : ''}
                        </div>
                    </div>
                    <div class="credential-item">
                        <label>Password</label>
                        <div class="credential-value">
                            <span id="pass-${purchaseId}">${credentials.password ? '••••••••' : 'ยังไม่มีข้อมูล'}</span>
                            ${credentials.password ? `
                                <button onclick="togglePasswordById('pass-${purchaseId}', '${credentials.password}')" title="แสดง/ซ่อน"><i class="fas fa-eye"></i></button>
                                <button onclick="copyToClipboard('${credentials.password}')" title="คัดลอก"><i class="fas fa-copy"></i></button>
                            ` : ''}
                        </div>
                    </div>
                </div>
                <p class="credentials-note"><i class="fas fa-exclamation-triangle"></i> กรุณาเปลี่ยนรหัสผ่านทันทีหลังเข้าสู่ระบบ!</p>
            </div>
        `;
        
        // Change modal title
        const modalContent = document.querySelector('#contactInfoModal .modal-content');
        const h2 = modalContent.querySelector('h2');
        if (h2) h2.innerHTML = '<i class="fas fa-shopping-bag"></i> รายละเอียดการซื้อ';
        
        openModal('contactInfoModal');
    } catch (e) {
        console.error('Show purchase detail error:', e);
        showToast('เกิดข้อผิดพลาด', 'error');
    }
}

function togglePasswordById(elementId, password) {
    const span = document.getElementById(elementId);
    if (!span) return;
    
    if (span.textContent === '••••••••') {
        span.textContent = password;
    } else {
        span.textContent = '••••••••';
    }
}

async function loadUserSales() {
    const container = document.getElementById('salesList');
    if (!container) return;
    
    try {
        const snap = await db.collection('listings')
            .where('sellerId', '==', currentUser.id)
            .get();
        
        const sales = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        sales.sort((a, b) => {
            const dateA = a.createdAt?.toDate?.() || new Date(0);
            const dateB = b.createdAt?.toDate?.() || new Date(0);
            return dateB - dateA;
        });
        
        if (sales.length === 0) {
            container.innerHTML = '<p class="empty">ยังไม่มีการขาย</p>';
            return;
        }
        
        container.innerHTML = sales.map(s => `
            <div class="sale-history-item">
                <img src="${s.image || getDefaultImage(s.rank)}" alt="">
                <div class="sale-info">
                    <h4>${escapeHtml(s.title)}</h4>
                    <p>${getRankName(s.rank)} • ${s.skins} Skins</p>
                </div>
                <div class="sale-price">฿${(s.price || 0).toLocaleString()}</div>
                <div class="sale-status ${s.status}">
                    ${s.status === 'approved' ? '<i class="fas fa-check"></i> กำลังขาย' : 
                      s.status === 'pending' ? '<i class="fas fa-clock"></i> รออนุมัติ' : 
                      s.status === 'sold' ? '<i class="fas fa-check-double"></i> ขายแล้ว' : 
                      '<i class="fas fa-times"></i> ปฏิเสธ'}
                </div>
            </div>
        `).join('');
    } catch (e) {
        console.error('Load sales error:', e);
        container.innerHTML = '<p class="empty">เกิดข้อผิดพลาด</p>';
    }
}

async function loadUserTransactions() {
    const container = document.getElementById('transactionsList');
    if (!container) return;
    
    try {
        // Get deposits
        const depositsSnap = await db.collection('deposits')
            .where('userId', '==', currentUser.id)
            .get();
        
        // Get withdrawals
        const withdrawalsSnap = await db.collection('withdrawals')
            .where('userId', '==', currentUser.id)
            .get();
        
        const transactions = [
            ...depositsSnap.docs.map(d => ({ id: d.id, type: 'deposit', ...d.data() })),
            ...withdrawalsSnap.docs.map(d => ({ id: d.id, type: 'withdrawal', ...d.data() }))
        ];
        
        transactions.sort((a, b) => {
            const dateA = a.createdAt?.toDate?.() || new Date(0);
            const dateB = b.createdAt?.toDate?.() || new Date(0);
            return dateB - dateA;
        });
        
        if (transactions.length === 0) {
            container.innerHTML = '<p class="empty">ยังไม่มีธุรกรรม</p>';
            return;
        }
        
        container.innerHTML = transactions.map(t => `
            <div class="transaction-item ${t.type}">
                <div class="transaction-icon">
                    <i class="fas fa-${t.type === 'deposit' ? 'plus-circle' : 'minus-circle'}"></i>
                </div>
                <div class="transaction-info">
                    <h4>${t.type === 'deposit' ? 'เติมเงิน' : 'ถอนเงิน'}</h4>
                    <p>${formatDate(t.createdAt)}</p>
                </div>
                <div class="transaction-amount ${t.type}">${t.type === 'deposit' ? '+' : '-'}฿${(t.amount || 0).toLocaleString()}</div>
                <div class="transaction-status ${t.status}">
                    ${t.status === 'approved' || t.status === 'completed' ? '<i class="fas fa-check"></i>' : 
                      t.status === 'pending' ? '<i class="fas fa-clock"></i>' : '<i class="fas fa-times"></i>'}
                </div>
            </div>
        `).join('');
    } catch (e) {
        console.error('Load transactions error:', e);
        container.innerHTML = '<p class="empty">เกิดข้อผิดพลาด</p>';
    }
}

function switchDashboardTab(tab, btn) {
    document.querySelectorAll('.dashboard-tabs .tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.dashboard-tab').forEach(t => t.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('tab-' + tab).classList.add('active');
    
    // Refresh data when switching tabs
    if (tab === 'purchases') loadUserPurchases();
    if (tab === 'sales') loadUserSales();
    if (tab === 'transactions') loadUserTransactions();
}

// ============================================================
// Admin
// ============================================================
let selectedChatUser = null;
let chatUnsubscribe = null;

// Admin Credentials
const ADMIN_USERNAME = 'admin';
const ADMIN_PASSWORD = 'Admin123';

function showAdminLogin() {
    openModal('adminLoginModal');
}

function loginAdmin() {
    const username = document.getElementById('adminUsername').value.trim();
    const password = document.getElementById('adminPassword').value;
    
    if (!username || !password) {
        showToast('กรุณากรอกข้อมูลให้ครบ', 'error');
        return;
    }
    
    if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
        isAdmin = true;
        closeModal('adminLoginModal');
        showPage('admin');
        loadAdminData();
        showToast('เข้าสู่ระบบ Admin สำเร็จ', 'success');
        
        // Clear form
        document.getElementById('adminUsername').value = '';
        document.getElementById('adminPassword').value = '';
    } else {
        showToast('Username หรือ Password ไม่ถูกต้อง', 'error');
    }
}

function logoutAdmin() {
    isAdmin = false;
    if (chatUnsubscribe) chatUnsubscribe();
    showPage('home');
    showToast('ออกจากระบบ Admin', 'success');
}

async function loadAdminData() {
    await loadPendingListings();
    await loadAllListings();
    await loadAdminDeposits();
    await loadAdminWithdrawals();
    await loadAdminUsers();
    await loadAdminChats();
}

// Load Pending Listings with Full Details
async function loadPendingListings() {
    const pendingList = document.getElementById('pendingList');
    try {
        const snap = await db.collection('listings').where('status', '==', 'pending').get();
        
        // Sort on client side
        const listings = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        listings.sort((a, b) => {
            const dateA = a.createdAt?.toDate?.() || new Date(0);
            const dateB = b.createdAt?.toDate?.() || new Date(0);
            return dateB - dateA;
        });
        
        document.getElementById('badgePending').textContent = listings.length;
        
        if (listings.length === 0) {
            pendingList.innerHTML = '<p class="empty">ไม่มีรายการรออนุมัติ</p>';
            return;
        }
        
        pendingList.innerHTML = listings.map(l => {
            const contact = l.contact || {};
            return `
                <div class="pending-item" id="pending-${l.id}">
                    <div class="pending-item-header">
                        <h3>${escapeHtml(l.title) || 'ไม่มีชื่อ'}</h3>
                        <span class="pending-date">${formatDate(l.createdAt)}</span>
                    </div>
                    <div class="pending-item-grid">
                        <img src="${l.image || getDefaultImage(l.rank)}" alt="" onerror="this.src='${getDefaultImage(l.rank)}'">
                        <div class="pending-item-info">
                            <div class="field"><label>Rank</label><span>${getRankName(l.rank)}</span></div>
                            <div class="field"><label>Skins</label><span>${l.skins || 0}</span></div>
                            <div class="field"><label>ราคา</label><span>฿${(l.price || 0).toLocaleString()}</span></div>
                            <div class="field"><label>ประเภท</label><span>${l.sellType === 'instant' ? 'ขายทันที' : 'ลงตลาด'}</span></div>
                            <div class="field"><label>ผู้ขาย</label><span>${escapeHtml(l.sellerName) || 'Unknown'}</span></div>
                            <div class="field"><label>Seller ID</label><span style="font-size:0.75rem">${l.sellerId || '-'}</span></div>
                        </div>
                    </div>
                    ${l.featuredSkins ? `<div class="field full"><label>Skins เด่น</label><span>${escapeHtml(l.featuredSkins)}</span></div>` : ''}
                    ${l.highlights ? `<div class="field full"><label>จุดเด่น</label><span>${escapeHtml(l.highlights)}</span></div>` : ''}
                    <div class="pending-item-contacts">
                        <h4><i class="fas fa-address-book"></i> ติดต่อผู้ขายเพื่อขอ ID/Password</h4>
                        <div class="contact-list">
                            ${contact.facebook ? `<span><i class="fab fa-facebook"></i> ${escapeHtml(contact.facebook)}</span>` : ''}
                            ${contact.line ? `<span><i class="fab fa-line"></i> ${escapeHtml(contact.line)}</span>` : ''}
                            ${contact.discord ? `<span><i class="fab fa-discord"></i> ${escapeHtml(contact.discord)}</span>` : ''}
                            ${contact.phone ? `<span><i class="fas fa-phone"></i> ${escapeHtml(contact.phone)}</span>` : ''}
                        </div>
                    </div>
                    <div class="pending-credentials">
                        <h4><i class="fas fa-key"></i> กรอก ID/Password (หลังตรวจสอบแล้ว)</h4>
                        <div class="credentials-form">
                            <div class="form-group">
                                <label>Riot ID / Email</label>
                                <input type="text" id="gameId-${l.id}" placeholder="กรอก Riot ID หรือ Email">
                            </div>
                            <div class="form-group">
                                <label>Password</label>
                                <input type="text" id="gamePass-${l.id}" placeholder="กรอก Password">
                            </div>
                        </div>
                    </div>
                    <div class="pending-actions">
                        <button class="btn-reject" onclick="rejectListing('${l.id}')"><i class="fas fa-times"></i> ปฏิเสธ</button>
                        <button class="btn-approve" onclick="approveListing('${l.id}')"><i class="fas fa-check"></i> อนุมัติ</button>
                    </div>
                </div>
            `;
        }).join('');
    } catch (e) {
        console.error('Load pending error:', e);
        pendingList.innerHTML = '<p class="empty">เกิดข้อผิดพลาด: ' + e.message + '</p>';
    }
}

function formatDate(timestamp) {
    if (!timestamp) return '-';
    try {
        const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
        return date.toLocaleDateString('th-TH') + ' ' + date.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
    } catch (e) {
        return '-';
    }
}

// Load All Listings for Admin with Edit/Delete
async function loadAllListings() {
    const container = document.getElementById('adminListingsTable');
    try {
        const snap = await db.collection('listings').get();
        
        // Sort on client side
        const listings = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        listings.sort((a, b) => {
            const dateA = a.createdAt?.toDate?.() || new Date(0);
            const dateB = b.createdAt?.toDate?.() || new Date(0);
            return dateB - dateA;
        });
        
        if (listings.length === 0) {
            container.innerHTML = '<p class="empty">ไม่มีประกาศ</p>';
            return;
        }
        
        container.innerHTML = listings.map(l => `
            <div class="admin-listing-item">
                <img src="${l.image || getDefaultImage(l.rank)}" alt="" onerror="this.src='${getDefaultImage(l.rank)}'">
                <div class="info">
                    <h4>${escapeHtml(l.title) || 'ไม่มีชื่อ'}</h4>
                    <p>${getRankName(l.rank)} • ${l.skins || 0} Skins • ${escapeHtml(l.sellerName) || 'Unknown'}</p>
                </div>
                <span class="price">฿${(l.price || 0).toLocaleString()}</span>
                <span class="status ${l.status}">${getStatusName(l.status)}</span>
                <div class="actions">
                    <button class="btn-view" onclick="viewListingAdmin('${l.id}')"><i class="fas fa-eye"></i></button>
                    <button class="btn-edit" onclick="editListing('${l.id}')"><i class="fas fa-edit"></i></button>
                    <button class="btn-delete" onclick="deleteListing('${l.id}')"><i class="fas fa-trash"></i></button>
                </div>
            </div>
        `).join('');
    } catch (e) {
        console.error('Load listings error:', e);
        container.innerHTML = '<p class="empty">เกิดข้อผิดพลาด: ' + e.message + '</p>';
    }
}

function getStatusName(status) {
    const names = { approved: 'อนุมัติ', pending: 'รออนุมัติ', rejected: 'ปฏิเสธ', sold: 'ขายแล้ว' };
    return names[status] || status;
}

// View Listing Full Details (Admin)
async function viewListingAdmin(id) {
    try {
        const doc = await db.collection('listings').doc(id).get();
        if (!doc.exists) {
            showToast('ไม่พบประกาศ', 'error');
            return;
        }
        const l = doc.data();
        const contact = l.contact || {};
        
        document.getElementById('viewListingContent').innerHTML = `
            <div class="listing-detail-view">
                <div class="images">
                    <img class="main-image" src="${l.image || 'https://via.placeholder.com/400'}" alt="">
                </div>
                <div class="details">
                    <div class="info-section">
                        <h3>${l.title || 'ไม่มีชื่อ'}</h3>
                        <span class="status ${l.status}">${getStatusName(l.status)}</span>
                    </div>
                    <div class="info-section">
                        <div class="info-row"><span class="info-label">Rank</span><span class="info-value">${getRankName(l.rank)}</span></div>
                        <div class="info-row"><span class="info-label">จำนวน Skins</span><span class="info-value">${l.skins || 0}</span></div>
                        <div class="info-row"><span class="info-label">ราคา</span><span class="info-value">฿${(l.price || 0).toLocaleString()}</span></div>
                        <div class="info-row"><span class="info-label">ประเภท</span><span class="info-value">${l.sellType === 'instant' ? 'ขายทันที' : 'ลงตลาด'}</span></div>
                    </div>
                    <div class="info-section">
                        <div class="info-row"><span class="info-label">Skins เด่น</span><span class="info-value">${l.featuredSkins || '-'}</span></div>
                        <div class="info-row"><span class="info-label">จุดเด่น</span><span class="info-value">${l.highlights || '-'}</span></div>
                    </div>
                    <div class="info-section">
                        <h4>ผู้ขาย</h4>
                        <div class="info-row"><span class="info-label">ชื่อ</span><span class="info-value">${l.sellerName || 'Unknown'}</span></div>
                        <div class="info-row"><span class="info-label">ID</span><span class="info-value">${l.sellerId || '-'}</span></div>
                    </div>
                    <div class="info-section">
                        <h4>ช่องทางติดต่อ</h4>
                        ${contact.facebook ? `<div class="contact-item"><i class="fab fa-facebook"></i>${contact.facebook}</div>` : ''}
                        ${contact.line ? `<div class="contact-item"><i class="fab fa-line"></i>${contact.line}</div>` : ''}
                        ${contact.discord ? `<div class="contact-item"><i class="fab fa-discord"></i>${contact.discord}</div>` : ''}
                        ${contact.phone ? `<div class="contact-item"><i class="fas fa-phone"></i>${contact.phone}</div>` : ''}
                    </div>
                </div>
            </div>
            <div class="form-actions">
                <button class="btn-secondary" onclick="closeModal('viewListingModal')">ปิด</button>
                <button class="btn-primary" onclick="closeModal('viewListingModal');editListing('${id}')"><i class="fas fa-edit"></i> แก้ไข</button>
            </div>
        `;
        openModal('viewListingModal');
    } catch (e) {
        console.error('View error:', e);
        showToast('เกิดข้อผิดพลาด', 'error');
    }
}

// Edit Listing
async function editListing(id) {
    try {
        const doc = await db.collection('listings').doc(id).get();
        if (!doc.exists) {
            showToast('ไม่พบประกาศ', 'error');
            return;
        }
        const l = doc.data();
        
        document.getElementById('editListingId').value = id;
        document.getElementById('editTitle').value = l.title || '';
        document.getElementById('editRank').value = l.rank || 'gold';
        document.getElementById('editSkins').value = l.skins || 0;
        document.getElementById('editPrice').value = l.price || 0;
        document.getElementById('editFeaturedSkins').value = l.featuredSkins || '';
        document.getElementById('editHighlights').value = l.highlights || '';
        document.getElementById('editImage').value = l.image || '';
        document.getElementById('editStatus').value = l.status || 'pending';
        
        openModal('editListingModal');
    } catch (e) {
        console.error('Edit error:', e);
        showToast('เกิดข้อผิดพลาด', 'error');
    }
}

async function saveEditListing(e) {
    e.preventDefault();
    const id = document.getElementById('editListingId').value;
    
    const updates = {
        title: document.getElementById('editTitle').value,
        rank: document.getElementById('editRank').value,
        skins: parseInt(document.getElementById('editSkins').value) || 0,
        price: parseInt(document.getElementById('editPrice').value) || 0,
        featuredSkins: document.getElementById('editFeaturedSkins').value,
        highlights: document.getElementById('editHighlights').value,
        image: document.getElementById('editImage').value,
        status: document.getElementById('editStatus').value,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    
    try {
        await db.collection('listings').doc(id).update(updates);
        showToast('บันทึกสำเร็จ', 'success');
        closeModal('editListingModal');
        loadAllListings();
        loadListings(); // Refresh marketplace
    } catch (e) {
        console.error('Save error:', e);
        showToast('เกิดข้อผิดพลาด', 'error');
    }
}

async function deleteListing(id) {
    if (!confirm('ต้องการลบประกาศนี้?')) return;
    try {
        await db.collection('listings').doc(id).delete();
        showToast('ลบสำเร็จ', 'success');
        loadAllListings();
        loadListings();
    } catch (e) {
        console.error('Delete error:', e);
        showToast('เกิดข้อผิดพลาด', 'error');
    }
}

async function approveListing(id) {
    // Get ID and Password from form
    const gameId = document.getElementById('gameId-' + id)?.value.trim();
    const gamePass = document.getElementById('gamePass-' + id)?.value.trim();
    
    if (!gameId || !gamePass) {
        showToast('กรุณากรอก ID และ Password ก่อนอนุมัติ', 'error');
        return;
    }
    
    try {
        await db.collection('listings').doc(id).update({ 
            status: 'approved',
            gameCredentials: {
                id: gameId,
                password: gamePass
            },
            approvedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        showToast('อนุมัติแล้ว - ID พร้อมขาย', 'success');
        await loadPendingListings();
        await loadAllListings();
        await loadListings();
    } catch (e) {
        console.error('Approve error:', e);
        showToast('เกิดข้อผิดพลาด: ' + e.message, 'error');
    }
}

async function rejectListing(id) {
    const reason = prompt('เหตุผลที่ปฏิเสธ (ไม่บังคับ):');
    try {
        await db.collection('listings').doc(id).update({ 
            status: 'rejected',
            rejectReason: reason || '',
            rejectedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        showToast('ปฏิเสธแล้ว', 'success');
        await loadPendingListings();
        await loadAllListings();
    } catch (e) {
        console.error('Reject error:', e);
        showToast('เกิดข้อผิดพลาด: ' + e.message, 'error');
    }
}

async function loadAdminDeposits() {
    try {
        const snap = await db.collection('deposits').where('status', '==', 'pending').get();
        document.getElementById('badgeDeposits').textContent = snap.size;
        document.getElementById('depositsList').innerHTML = snap.empty 
            ? '<p class="empty">ไม่มีรายการ</p>'
            : snap.docs.map(d => {
                const dep = d.data();
                return `<div class="admin-item"><div><strong>฿${dep.amount}</strong><br><small>${dep.method} - ${dep.userId}</small></div>
                <div><button class="btn-approve" onclick="approveDeposit('${d.id}',${dep.amount},'${dep.userId}')"><i class="fas fa-check"></i></button></div></div>`;
            }).join('');
    } catch (e) {
        document.getElementById('depositsList').innerHTML = '<p class="empty">Demo Mode</p>';
    }
}

async function loadAdminWithdrawals() {
    try {
        const snap = await db.collection('withdrawals').where('status', '==', 'pending').get();
        document.getElementById('badgeWithdrawals').textContent = snap.size;
        document.getElementById('withdrawalsList').innerHTML = snap.empty 
            ? '<p class="empty">ไม่มีรายการ</p>'
            : snap.docs.map(d => {
                const w = d.data();
                return `<div class="admin-item"><div><strong>฿${w.amount}</strong><br><small>${w.method} - ${w.account}</small></div>
                <div><button class="btn-approve" onclick="approveWithdraw('${d.id}')"><i class="fas fa-check"></i></button></div></div>`;
            }).join('');
    } catch (e) {
        document.getElementById('withdrawalsList').innerHTML = '<p class="empty">Demo Mode</p>';
    }
}

async function loadAdminUsers() {
    try {
        const snap = await db.collection('users').limit(50).get();
        document.getElementById('usersTable').innerHTML = snap.docs.map(d => {
            const u = d.data();
            return `<div class="admin-item"><div><strong>${u.username}</strong><br><small>${u.email || u.phone || '-'}</small></div><div>${u.coins || 0} Coins</div></div>`;
        }).join('') || '<p class="empty">ไม่มีผู้ใช้</p>';
    } catch (e) {
        document.getElementById('usersTable').innerHTML = '<p>Demo Mode</p>';
    }
}

async function approveDeposit(id, amount, userId) {
    try {
        await db.collection('deposits').doc(id).update({ status: 'approved' });
        const userRef = db.collection('users').doc(userId);
        const userDoc = await userRef.get();
        if (userDoc.exists) {
            await userRef.update({ coins: (userDoc.data().coins || 0) + amount });
        }
        showToast('อนุมัติการเติมเงินแล้ว', 'success');
        loadAdminDeposits();
    } catch (e) {
        showToast('เกิดข้อผิดพลาด', 'error');
    }
}

async function approveWithdraw(id) {
    try {
        await db.collection('withdrawals').doc(id).update({ status: 'approved' });
        showToast('อนุมัติการถอนเงินแล้ว', 'success');
        loadAdminWithdrawals();
    } catch (e) {
        showToast('เกิดข้อผิดพลาด', 'error');
    }
}

function switchAdminTab(tab, el) {
    document.querySelectorAll('.admin-sidebar .nav-item').forEach(n => n.classList.remove('active'));
    document.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));
    el.classList.add('active');
    document.getElementById('admin-' + tab).classList.add('active');
    
    if (tab === 'chats') loadAdminChats();
}

function searchUsers(q) {
    // Simple filter
    const items = document.querySelectorAll('#usersTable .admin-item');
    items.forEach(item => {
        const text = item.textContent.toLowerCase();
        item.style.display = text.includes(q.toLowerCase()) ? 'flex' : 'none';
    });
}

// ============================================================
// Chat System
// ============================================================

// User Chat Functions
function toggleChat() {
    const box = document.getElementById('chatBox');
    box.classList.toggle('active');
    if (box.classList.contains('active')) {
        loadUserChatMessages();
    }
}

async function loadUserChatMessages() {
    if (!currentUser) return;
    const container = document.getElementById('userChatMessages');
    
    try {
        // Simple query without orderBy to avoid index requirement
        const snap = await db.collection('chats')
            .where('participants', 'array-contains', currentUser.id)
            .get();
        
        // Sort on client side
        const messages = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        messages.sort((a, b) => {
            const dateA = a.createdAt?.toDate?.() || new Date(0);
            const dateB = b.createdAt?.toDate?.() || new Date(0);
            return dateA - dateB;
        });
        
        if (messages.length === 0) {
            container.innerHTML = '<p style="text-align:center;color:var(--text-muted);padding:20px">เริ่มแชทกับแอดมิน</p>';
        } else {
            container.innerHTML = messages.map(m => {
                const isUser = m.senderId === currentUser.id;
                return `<div class="chat-message ${isUser ? 'user' : 'admin'}">
                    ${escapeHtml(m.message)}
                    <span class="time">${formatTime(m.createdAt)}</span>
                </div>`;
            }).join('');
        }
        
        container.scrollTop = container.scrollHeight;
        
        // Mark admin messages as read
        markMessagesAsRead(messages);
    } catch (e) {
        console.log('Chat load error:', e);
        container.innerHTML = '<p style="text-align:center;color:var(--text-muted);padding:20px">เริ่มแชทกับแอดมิน</p>';
    }
}

async function sendUserMessage() {
    if (!currentUser) {
        showToast('กรุณาเข้าสู่ระบบก่อน', 'error');
        return;
    }
    
    const input = document.getElementById('userMessageInput');
    const message = input.value.trim();
    if (!message) return;
    
    // Disable input while sending
    input.disabled = true;
    
    try {
        await db.collection('chats').add({
            message,
            senderId: currentUser.id,
            senderName: currentUser.username || 'User',
            senderAvatar: currentUser.avatar || '',
            participants: [currentUser.id, 'admin'],
            isFromAdmin: false,
            read: false,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        input.value = '';
        await loadUserChatMessages();
        showToast('ส่งข้อความสำเร็จ', 'success');
    } catch (e) {
        console.error('Send error:', e);
        if (e.code === 'permission-denied') {
            showToast('⚠️ ต้องตั้งค่า Firestore Rules ก่อน', 'error');
            console.log(`
╔════════════════════════════════════════════════════════════════╗
║  ⚠️ FIRESTORE PERMISSION ERROR                                 ║
║                                                                ║
║  กรุณาไปที่ Firebase Console > Firestore Database > Rules     ║
║  แล้ววางโค้ดนี้:                                               ║
║                                                                ║
║  rules_version = '2';                                         ║
║  service cloud.firestore {                                    ║
║    match /databases/{database}/documents {                    ║
║      match /{document=**} {                                   ║
║        allow read, write: if true;                            ║
║      }                                                        ║
║    }                                                          ║
║  }                                                            ║
║                                                                ║
║  แล้วกด Publish                                               ║
╚════════════════════════════════════════════════════════════════╝
            `);
        } else {
            showToast('ส่งข้อความไม่สำเร็จ: ' + e.message, 'error');
        }
    } finally {
        input.disabled = false;
        input.focus();
    }
}

async function markMessagesAsRead(messages) {
    if (!currentUser || !messages) return;
    try {
        const unreadFromAdmin = messages.filter(m => m.isFromAdmin && !m.read);
        if (unreadFromAdmin.length > 0) {
            const batch = db.batch();
            unreadFromAdmin.forEach(m => {
                const ref = db.collection('chats').doc(m.id);
                batch.update(ref, { read: true });
            });
            await batch.commit();
        }
        document.getElementById('chatUnread').style.display = 'none';
    } catch (e) {
        console.log('Mark read error:', e);
    }
}

// Admin Chat Functions
async function loadAdminChats() {
    const container = document.getElementById('chatUsersList');
    
    try {
        // Simple query without orderBy
        const snap = await db.collection('chats')
            .where('participants', 'array-contains', 'admin')
            .get();
        
        // Sort on client side
        const allMessages = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        allMessages.sort((a, b) => {
            const dateA = a.createdAt?.toDate?.() || new Date(0);
            const dateB = b.createdAt?.toDate?.() || new Date(0);
            return dateB - dateA;
        });
        
        // Group by user
        const userChats = {};
        allMessages.forEach(m => {
            const oderId = m.senderId === 'admin' ? m.participants.find(p => p !== 'admin') : m.senderId;
            if (!oderId) return;
            
            if (!userChats[oderId]) {
                userChats[oderId] = {
                    oderId,
                    name: m.isFromAdmin ? 'User' : (m.senderName || 'Unknown'),
                    avatar: m.senderAvatar || 'https://ui-avatars.com/api/?name=U&background=ff4655&color=fff',
                    lastMessage: m.message,
                    unread: (!m.read && !m.isFromAdmin) ? 1 : 0
                };
            } else if (!m.read && !m.isFromAdmin) {
                userChats[oderId].unread++;
            }
            
            // Update name if we find a non-admin message
            if (!m.isFromAdmin && m.senderName) {
                userChats[oderId].name = m.senderName;
                if (m.senderAvatar) userChats[oderId].avatar = m.senderAvatar;
            }
        });
        
        const users = Object.values(userChats);
        const totalUnread = users.reduce((sum, u) => sum + u.unread, 0);
        document.getElementById('badgeChats').textContent = totalUnread;
        
        container.innerHTML = users.length === 0 
            ? '<p class="empty" style="padding:20px;text-align:center">ไม่มีแชท</p>'
            : users.map(u => `
                <div class="chat-user-item ${selectedChatUser === u.oderId ? 'active' : ''}" onclick="selectChatUser('${u.oderId}', this)">
                    <img src="${u.avatar}" alt="" onerror="this.src='https://ui-avatars.com/api/?name=U&background=ff4655&color=fff'">
                    <div class="info">
                        <div class="name">${escapeHtml(u.name)}</div>
                        <div class="preview">${escapeHtml(u.lastMessage || '')}</div>
                    </div>
                    ${u.unread > 0 ? `<span class="unread-badge">${u.unread}</span>` : ''}
                </div>
            `).join('');
    } catch (e) {
        console.error('Load chats error:', e);
        container.innerHTML = '<p class="empty" style="padding:20px;text-align:center">เกิดข้อผิดพลาด</p>';
    }
}

async function selectChatUser(oderId, el) {
    selectedChatUser = oderId;
    document.querySelectorAll('.chat-user-item').forEach(item => item.classList.remove('active'));
    if (el) el.classList.add('active');
    
    const nameEl = el ? el.querySelector('.name') : null;
    document.getElementById('chatHeader').innerHTML = `<span>แชทกับ ${nameEl ? nameEl.textContent : 'User'}</span>`;
    document.getElementById('adminChatInput').style.display = 'flex';
    
    await loadAdminChatMessages(oderId);
}

async function loadAdminChatMessages(oderId) {
    const container = document.getElementById('adminChatMessages');
    
    try {
        const snap = await db.collection('chats')
            .where('participants', 'array-contains', oderId)
            .get();
        
        const messages = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        messages.sort((a, b) => {
            const dateA = a.createdAt?.toDate?.() || new Date(0);
            const dateB = b.createdAt?.toDate?.() || new Date(0);
            return dateA - dateB;
        });
        
        container.innerHTML = messages.map(m => {
            const isAdmin = m.isFromAdmin;
            return `<div class="chat-message ${isAdmin ? 'user' : 'admin'}">
                ${escapeHtml(m.message)}
                <span class="time">${formatTime(m.createdAt)}</span>
            </div>`;
        }).join('') || '<p style="text-align:center;color:var(--text-muted);padding:20px">ไม่มีข้อความ</p>';
        
        container.scrollTop = container.scrollHeight;
        
        // Mark messages as read
        const unreadMessages = messages.filter(m => !m.isFromAdmin && !m.read);
        if (unreadMessages.length > 0) {
            const batch = db.batch();
            unreadMessages.forEach(m => {
                const ref = db.collection('chats').doc(m.id);
                batch.update(ref, { read: true });
            });
            await batch.commit();
            loadAdminChats(); // Refresh unread counts
        }
    } catch (e) {
        console.error('Load messages error:', e);
        container.innerHTML = '<p style="text-align:center;color:var(--text-muted);padding:20px">เกิดข้อผิดพลาด</p>';
    }
}

async function markAdminMessagesAsRead(oderId) {
    // Now handled in loadAdminChatMessages
}

async function sendAdminMessage() {
    if (!selectedChatUser) {
        showToast('กรุณาเลือกผู้ใช้ก่อน', 'error');
        return;
    }
    
    const input = document.getElementById('adminMessageInput');
    const message = input.value.trim();
    if (!message) return;
    
    input.disabled = true;
    
    try {
        await db.collection('chats').add({
            message,
            senderId: 'admin',
            senderName: 'Admin',
            senderAvatar: '',
            participants: [selectedChatUser, 'admin'],
            isFromAdmin: true,
            read: false,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        input.value = '';
        await loadAdminChatMessages(selectedChatUser);
        await loadAdminChats();
    } catch (e) {
        console.error('Send error:', e);
        showToast('ส่งข้อความไม่สำเร็จ: ' + e.message, 'error');
    } finally {
        input.disabled = false;
        input.focus();
    }
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatTime(timestamp) {
    if (!timestamp) return '';
    try {
        const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
        return date.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
    } catch (e) {
        return '';
    }
}

// ============================================================
// UI Functions
// ============================================================
function showPage(page) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
    document.getElementById('page-' + page)?.classList.add('active');
    document.querySelector(`.nav-link[onclick*="${page}"]`)?.classList.add('active');
    window.scrollTo(0, 0);
    
    if (page === 'dashboard' && currentUser) loadDashboardData();
    if (page === 'admin' && isAdmin) loadAdminData();
}

function showAuthModal() {
    openModal('authModal');
}

function switchAuthTab(tab, btn) {
    document.querySelectorAll('.auth-tabs button').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.auth-form').forEach(f => f.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(tab + 'Form').classList.add('active');
}

function openModal(id) {
    document.getElementById(id).classList.add('active');
    document.body.style.overflow = 'hidden';
}

function closeModal(id) {
    document.getElementById(id).classList.remove('active');
    document.body.style.overflow = '';
}

function toggleUserDropdown() {
    document.getElementById('userDropdown').classList.toggle('show');
}

document.addEventListener('click', (e) => {
    if (!e.target.closest('.user-menu')) {
        document.getElementById('userDropdown')?.classList.remove('show');
    }
    if (e.target.classList.contains('modal')) {
        e.target.classList.remove('active');
        document.body.style.overflow = '';
    }
});

function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = 'toast ' + type;
    toast.innerHTML = `<i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'info-circle'}"></i> ${message}`;
    container.appendChild(toast);
    setTimeout(() => toast.classList.add('show'), 10);
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

async function updateStats() {
    try {
        const listingsSnap = await db.collection('listings').where('status', '==', 'approved').get();
        const usersSnap = await db.collection('users').get();
        document.getElementById('statSales').textContent = listingsSnap.size;
        document.getElementById('statUsers').textContent = usersSnap.size;
    } catch (e) {
        document.getElementById('statSales').textContent = '1,234';
        document.getElementById('statUsers').textContent = '5,678';
    }
}

console.log('✅ App loaded successfully');
