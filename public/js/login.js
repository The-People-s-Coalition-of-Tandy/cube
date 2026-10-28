const loginForm = document.getElementById('loginForm');
const errorMessage = document.getElementById('errorMessage');
const loginBtn = document.getElementById('loginBtn');
const loading = document.getElementById('loading');

// Check if already authenticated
checkAuthStatus();

async function checkAuthStatus() {
    try {
        const response = await fetch('/api/auth/status');
        const data = await response.json();
        
        if (data.authenticated) {
            // Already logged in, redirect to intended page or admin panel
            window.location.href = data.redirectUrl || '/admin';
        }
    } catch (error) {
        console.log('Not authenticated');
    }
}

loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    
    if (!username || !password) {
        showError('Please enter both username and password');
        return;
    }
    
    setLoading(true);
    hideError();
    
    try {
        const response = await fetch('/api/auth/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ username, password })
        });
        
        const data = await response.json();
        
        if (data.success) {
            // Login successful, redirect to intended page or admin panel
            window.location.href = data.redirectUrl || '/admin';
        } else {
            showError(data.error || 'Login failed');
        }
    } catch (error) {
        showError('Connection error. Please try again.');
        console.error('Login error:', error);
    } finally {
        setLoading(false);
    }
});

function showError(message) {
    errorMessage.textContent = message;
    errorMessage.style.display = 'block';
}

function hideError() {
    errorMessage.style.display = 'none';
}

function setLoading(isLoading) {
    if (isLoading) {
        loginBtn.disabled = true;
        loginBtn.textContent = 'Signing In...';
        loading.style.display = 'block';
    } else {
        loginBtn.disabled = false;
        loginBtn.textContent = 'Sign In';
        loading.style.display = 'none';
    }
}

// Focus username field on load
document.getElementById('username').focus();
