let currentEvents = null;

// Load events on page load
window.onload = function() {
    loadEvents();
    loadLiveEventStatus();
};

async function loadEvents() {
    try {
        const response = await fetch('/api/events');
        if (!response.ok) {
            throw new Error('Failed to load events');
        }
        
        currentEvents = await response.json();
        displayEvents();
        setStatus('Events loaded successfully', 'success');
    } catch (error) {
        setStatus('Error loading events: ' + error.message, 'error');
    }
}

function displayEvents() {
    const eventsList = document.getElementById('eventsList');
    if (!currentEvents || !currentEvents.events) {
        eventsList.innerHTML = '<div class="event-item">No events found</div>';
        return;
    }
    
    // Sort events by datetime - upcoming events first (closest to now)
    const now = new Date();
    const sortedEvents = [...currentEvents.events].sort((a, b) => {
        // Try to use datetime field first, fall back to date field
        const dateA = a.datetime ? new Date(a.datetime) : new Date(a.date);
        const dateB = b.datetime ? new Date(b.datetime) : new Date(b.date);
        
        // Handle invalid dates by putting them at the end
        if (isNaN(dateA.getTime()) && isNaN(dateB.getTime())) return 0;
        if (isNaN(dateA.getTime())) return 1;
        if (isNaN(dateB.getTime())) return -1;
        
        // Sort by closest to current time (upcoming events first)
        const diffA = Math.abs(dateA - now);
        const diffB = Math.abs(dateB - now);
        
        // If both are in the future or both are in the past, sort by date
        if ((dateA >= now && dateB >= now) || (dateA < now && dateB < now)) {
            return dateA - dateB;
        }
        
        // Prioritize future events over past events
        if (dateA >= now && dateB < now) return -1;
        if (dateA < now && dateB >= now) return 1;
        
        return diffA - diffB;
    });
    
    eventsList.innerHTML = '';
    sortedEvents.forEach((event, index) => {
        // Find the original index for edit/delete operations
        const originalIndex = currentEvents.events.findIndex(e => 
            e.name === event.name && e.type === event.type && 
            (e.datetime === event.datetime || e.date === event.date)
        );
        
        const eventDiv = document.createElement('div');
        eventDiv.className = 'event-item';
        
        // Check if event is in the past
        const eventDate = event.datetime ? new Date(event.datetime) : new Date(event.date);
        const isPast = eventDate < now;
        
        // Format the datetime for display
        let displayDate = event.date;
        if (event.datetime) {
            const date = new Date(event.datetime);
            displayDate = date.toLocaleString('en-US', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                hour: 'numeric',
                minute: '2-digit',
                hour12: true
            });
        }
        
        // Add visual indicator for past events
        const pastIndicator = isPast ? ' <span style="color: #ff6b6b; font-size: 12px;">(PAST)</span>' : '';
        
        eventDiv.innerHTML = `
            <div><strong>Date:</strong> ${displayDate}${pastIndicator}</div>
            <div><strong>Name:</strong> ${event.name}</div>
            <div><strong>Type:</strong> ${event.type}</div>
            <button onclick="editEvent(${originalIndex})">Edit</button>
            <button onclick="deleteEvent(${originalIndex})">Delete</button>
        `;
        
        // Dim past events
        if (isPast) {
            eventDiv.style.opacity = '0.6';
        }
        
        eventsList.appendChild(eventDiv);
    });
}

async function addEvent() {
    const datetime = document.getElementById('newEventDate').value;
    const name = document.getElementById('newEventName').value.trim();
    const type = document.getElementById('newEventType').value.trim();
    
    if (!datetime || !name || !type) {
        setStatus('Please fill in all event fields', 'error');
        return;
    }
    
    if (!currentEvents) {
        currentEvents = {
            events: []
        };
    }
    
    if (!currentEvents.events) {
        currentEvents.events = [];
    }
    
    // Create formatted date string for display
    const date = new Date(datetime);
    const displayDate = date.toLocaleString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
    });
    
    currentEvents.events.push({
        datetime: datetime,
        date: displayDate,
        name: name,
        type: type,
    });
    
    // Clear form
    document.getElementById('newEventDate').value = '';
    document.getElementById('newEventName').value = '';
    document.getElementById('newEventType').value = '';
    
    await saveEvents();
}

function editEvent(index) {
    const event = currentEvents.events[index];
    
    // Create a modal-style edit form
    const modal = document.createElement('div');
    modal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0,0,0,0.8);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 1000;
    `;
    
    const form = document.createElement('div');
    form.style.cssText = `
        background: rgba(30, 60, 114, 0.95);
        padding: 30px;
        border-radius: 15px;
        border: 1px solid rgba(255,255,255,0.2);
        backdrop-filter: blur(10px);
        min-width: 400px;
    `;
    
    // Convert display date back to datetime-local format if possible
    let datetimeValue = '';
    if (event.datetime) {
        datetimeValue = event.datetime;
    } else if (event.date) {
        // Try to parse the old format
        try {
            const parsed = new Date(event.date);
            if (!isNaN(parsed.getTime())) {
                datetimeValue = parsed.toISOString().slice(0, 16);
            }
        } catch (e) {
            console.warn('Could not parse date:', event.date);
        }
    }
    
    form.innerHTML = `
        <h3 style="color: white; margin-top: 0;">Edit Event</h3>
        <div style="margin-bottom: 15px;">
            <label style="display: block; color: #e0e0e0; margin-bottom: 5px;">Date & Time:</label>
            <input type="datetime-local" id="editEventDate" value="${datetimeValue}" style="width: 100%; padding: 10px; border-radius: 5px; border: 1px solid #ccc; background: rgba(255,255,255,0.1); color: white;">
        </div>
        <div style="margin-bottom: 15px;">
            <label style="display: block; color: #e0e0e0; margin-bottom: 5px;">Name:</label>
            <input type="text" id="editEventName" value="${event.name}" style="width: 100%; padding: 10px; border-radius: 5px; border: 1px solid #ccc; background: rgba(255,255,255,0.1); color: white;">
        </div>
        <div style="margin-bottom: 20px;">
            <label style="display: block; color: #e0e0e0; margin-bottom: 5px;">Type:</label>
            <input type="text" id="editEventType" value="${event.type}" style="width: 100%; padding: 10px; border-radius: 5px; border: 1px solid #ccc; background: rgba(255,255,255,0.1); color: white;">
        </div>
        <div style="text-align: center;">
            <button id="saveEdit" style="background: #4CAF50; color: white; border: none; padding: 10px 20px; border-radius: 5px; margin-right: 10px; cursor: pointer;">Save</button>
            <button id="cancelEdit" style="background: #f44336; color: white; border: none; padding: 10px 20px; border-radius: 5px; cursor: pointer;">Cancel</button>
        </div>
    `;
    
    modal.appendChild(form);
    document.body.appendChild(modal);
    
    // Handle save
    document.getElementById('saveEdit').onclick = async () => {
        const newDatetime = document.getElementById('editEventDate').value;
        const newName = document.getElementById('editEventName').value.trim();
        const newType = document.getElementById('editEventType').value.trim();
        
        if (newDatetime && newName && newType) {
            const date = new Date(newDatetime);
            const displayDate = date.toLocaleString('en-US', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                hour: 'numeric',
                minute: '2-digit',
                hour12: true
            });
            
            currentEvents.events[index] = {
                datetime: newDatetime,
                date: displayDate,
                name: newName,
                type: newType,
            };
            
            await saveEvents();
            document.body.removeChild(modal);
        } else {
            alert('Please fill in all fields');
        }
    };
    
    // Handle cancel
    document.getElementById('cancelEdit').onclick = () => {
        document.body.removeChild(modal);
    };
    
    // Close on background click
    modal.onclick = (e) => {
        if (e.target === modal) {
            document.body.removeChild(modal);
        }
    };
}

async function deleteEvent(index) {
    if (confirm('Are you sure you want to delete this event?')) {
        currentEvents.events.splice(index, 1);
        await saveEvents();
    }
}

async function clearAllEvents() {
    if (confirm('Are you sure you want to delete ALL events? This cannot be undone.')) {
        if (currentEvents) {
            currentEvents.events = [];
            await saveEvents();
        }
    }
}

async function saveEvents() {
    try {
        const response = await fetch('/api/events', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(currentEvents)
        });
        
        if (!response.ok) {
            throw new Error('Failed to save events');
        }
        
        displayEvents();
        setStatus('Events saved successfully', 'success');
    } catch (error) {
        setStatus('Error saving events: ' + error.message, 'error');
    }
}

function setStatus(message, type) {
    const statusDiv = document.getElementById('status');
    statusDiv.textContent = message;
    statusDiv.className = 'status ' + (type || '');
}

async function setLiveEvent() {
    const name = document.getElementById('liveEventName').value.trim();
    const type = document.getElementById('liveEventType').value.trim();
    
    if (!name || !type) {
        setLiveEventStatus('Please fill in both event name and type', 'error');
        return;
    }
    
    const liveEvent = {
        name: name,
        type: type,
        isLiveOverride: true,
        timestamp: new Date().toISOString()
    };
    
    try {
        const response = await fetch('/api/live-event', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(liveEvent)
        });
        
        if (!response.ok) {
            throw new Error('Failed to set live event');
        }
        
        setLiveEventStatus(`🔴 LIVE: "${name}" is now showing as live on the homepage`, 'success');
        
        // Clear the form
        document.getElementById('liveEventName').value = '';
        document.getElementById('liveEventType').value = '';
        
    } catch (error) {
        setLiveEventStatus('Error setting live event: ' + error.message, 'error');
    }
}

async function clearLiveEvent() {
    try {
        const response = await fetch('/api/live-event', {
            method: 'DELETE'
        });
        
        if (!response.ok) {
            throw new Error('Failed to clear live event');
        }
        
        setLiveEventStatus('Live event override cleared', 'success');
        
    } catch (error) {
        setLiveEventStatus('Error clearing live event: ' + error.message, 'error');
    }
}

function setLiveEventStatus(message, type) {
    const statusDiv = document.getElementById('liveEventStatus');
    statusDiv.textContent = message;
    statusDiv.style.display = 'block';
    
    if (type === 'success') {
        statusDiv.style.background = 'rgba(76, 175, 80, 0.2)';
        statusDiv.style.border = '1px solid rgba(76, 175, 80, 0.5)';
        statusDiv.style.color = '#4CAF50';
    } else if (type === 'error') {
        statusDiv.style.background = 'rgba(244, 67, 54, 0.2)';
        statusDiv.style.border = '1px solid rgba(244, 67, 54, 0.5)';
        statusDiv.style.color = '#ff6b6b';
    }
    
    // Auto-hide after 5 seconds
    setTimeout(() => {
        statusDiv.style.display = 'none';
    }, 5000);
}

// Load current live event status on page load
async function loadLiveEventStatus() {
    try {
        const response = await fetch('/api/live-event');
        if (response.ok) {
            const liveEvent = await response.json();
            if (liveEvent && liveEvent.name) {
                setLiveEventStatus(`🔴 CURRENTLY LIVE: "${liveEvent.name}"`, 'success');
            }
        }
    } catch (error) {
        // Ignore errors - just means no live event is set
    }
}
