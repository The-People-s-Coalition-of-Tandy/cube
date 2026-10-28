// Event Calendar Management
async function loadEventCalendar() {
    try {
        const response = await fetch('./events.json');
        const eventData = await response.json();
        populateCalendar(eventData);
        await updateCurrentEvent(eventData); // Add this line to update current event
    } catch (error) {
        console.error('Failed to load events:', error);
        // Fallback content
        document.getElementById('calendar-content').innerHTML = `
            <div class="calendar-title">★ TRANSMISSION ERROR ★</div>
            <div class="calendar-note" style="color: #ff0000;">
                Unable to load event schedule. Please try again later.
            </div>
        `;
        // Update current event with error state
        updateCurrentEventError();
    }
}

async function updateCurrentEvent(eventData) {
    // First check for live event override
    try {
        const liveResponse = await fetch('./live-event.json');
        if (liveResponse.ok) {
            const liveEvent = await liveResponse.json();
            if (liveEvent && liveEvent.name && liveEvent.isLiveOverride) {
                // Show the live override event
                updateEventDisplay(liveEvent, true);
                return;
            }
        }
    } catch (error) {
        // No live event override, continue with scheduled events
    }
    
    const now = new Date();
    
    // Find the current or next upcoming event from scheduled events
    let currentEvent = null;
    let nextEvent = null;
    
    // Sort events by datetime to find current/next
    const sortedEvents = eventData.events
        .filter(event => {
            const eventDate = event.datetime ? new Date(event.datetime) : new Date(event.date);
            return !isNaN(eventDate.getTime());
        })
        .sort((a, b) => {
            const dateA = a.datetime ? new Date(a.datetime) : new Date(a.date);
            const dateB = b.datetime ? new Date(b.datetime) : new Date(b.date);
            return dateA - dateB;
        });
    
    // Find current event (happening now) or next upcoming event
    for (let event of sortedEvents) {
        const eventDate = event.datetime ? new Date(event.datetime) : new Date(event.date);
        
        // Check if event is happening now (within 30 minutes before to 2 hours after)
        const timeDiff = eventDate - now;
        const thirtyMinutes = 30 * 60 * 1000;
        const twoHours = 2 * 60 * 60 * 1000;
        
        // Event is considered "live" if it's within 30 minutes of start time or up to 2 hours after
        if (timeDiff >= -twoHours && timeDiff <= thirtyMinutes) {
            currentEvent = event;
            break;
        } else if (timeDiff > 0 && !nextEvent) {
            // This is the next upcoming event
            nextEvent = event;
        }
    }
    
    // Use current event if found, otherwise use next event
    const displayEvent = currentEvent || nextEvent;
    
    if (displayEvent) {
        updateEventDisplay(displayEvent, currentEvent !== null);
    } else {
        updateEventDisplayEmpty();
    }
}

function updateEventDisplay(event, isLive) {
    // Update live indicator
    const liveIndicator = document.getElementById('liveIndicator');
    if (liveIndicator) {
        if (isLive) {
            liveIndicator.style.display = 'flex';
            liveIndicator.querySelector('span:last-child').textContent = 'LIVE';
            liveIndicator.querySelector('.live-dot').style.background = '#ff0000'; // Red for live
            liveIndicator.style.color = '#ff0000';
        } else {
            liveIndicator.style.display = 'flex';
            liveIndicator.querySelector('span:last-child').textContent = 'NEXT UP';
            liveIndicator.querySelector('.live-dot').style.background = '#ffff00'; // Yellow for next up
            liveIndicator.style.color = '#ffff00';
        }
    }
    
    // Update artist name
    const artistElement = document.getElementById('currentEventArtist');
    if (artistElement) {
        // Extract artist name from event name or use a default
        const artistName = extractArtistName(event.name) || event.name;
        artistElement.textContent = artistName;
    }
    
    // Update event title with date information
    const eventTitleElement = document.getElementById('currentEventTitle');
    if (eventTitleElement) {
        const eventDate = event.datetime ? new Date(event.datetime) : new Date(event.date);
        const dateString = eventDate.toLocaleString('en-US', {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
        });
        
        if (isLive) {
            eventTitleElement.innerHTML = `<i>${event.type} – Live Now</i>`;
        } else {
            eventTitleElement.innerHTML = `<i>${event.type}</i><br><small style="color: #ffff00;">${dateString}</small>`;
        }
    }
    
    // Update stream info (now playing text)
    const nowPlayingElement = document.getElementById('nowPlayingText');
    if (nowPlayingElement) {
        const eventDate = event.datetime ? new Date(event.datetime) : new Date(event.date);
        
        if (isLive) {
            nowPlayingElement.textContent = `${event.name} – Live Now`;
        } else {
            // Calculate time until event
            const now = new Date();
            const timeDiff = eventDate - now;
            const days = Math.floor(timeDiff / (1000 * 60 * 60 * 24));
            const hours = Math.floor((timeDiff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
            const minutes = Math.floor((timeDiff % (1000 * 60 * 60)) / (1000 * 60));
            
            let timeUntil = '';
            if (days > 0) {
                timeUntil = `in ${days} day${days > 1 ? 's' : ''}`;
            } else if (hours > 0) {
                timeUntil = `in ${hours} hour${hours > 1 ? 's' : ''}`;
            } else if (minutes > 0) {
                timeUntil = `in ${minutes} minute${minutes > 1 ? 's' : ''}`;
            } else {
                timeUntil = 'starting soon';
            }
            
            const dateString = eventDate.toLocaleString('en-US', {
                weekday: 'short',
                month: 'short',
                day: 'numeric',
                hour: 'numeric',
                minute: '2-digit',
                hour12: true
            });
            
            nowPlayingElement.textContent = `Next: ${event.name} – ${dateString} (${timeUntil})`;
        }
    }
}

function updateEventDisplayEmpty() {
    // Update live indicator
    const liveIndicator = document.getElementById('liveIndicator');
    if (liveIndicator) {
        liveIndicator.style.display = 'none';
    }
    
    // Update artist name
    const artistElement = document.getElementById('currentEventArtist');
    if (artistElement) {
        artistElement.textContent = 'THE CUBE';
    }
    
    // Update event title
    const eventTitleElement = document.getElementById('currentEventTitle');
    if (eventTitleElement) {
        eventTitleElement.innerHTML = '<i>No scheduled events</i>';
    }
    
    // Update stream info
    const nowPlayingElement = document.getElementById('nowPlayingText');
    if (nowPlayingElement) {
        nowPlayingElement.textContent = 'Check back soon for upcoming events';
    }
}

function updateCurrentEventError() {
    // Update live indicator
    const liveIndicator = document.getElementById('liveIndicator');
    if (liveIndicator) {
        liveIndicator.style.display = 'flex';
        liveIndicator.querySelector('span:last-child').textContent = 'ERROR';
        liveIndicator.style.color = '#ff0000';
    }
    
    // Update artist name
    const artistElement = document.getElementById('currentEventArtist');
    if (artistElement) {
        artistElement.textContent = 'THE CUBE';
    }
    
    // Update event title
    const eventTitleElement = document.getElementById('currentEventTitle');
    if (eventTitleElement) {
        eventTitleElement.innerHTML = '<i>Unable to load schedule</i>';
    }
    
    // Update stream info
    const nowPlayingElement = document.getElementById('nowPlayingText');
    if (nowPlayingElement) {
        nowPlayingElement.textContent = 'Schedule temporarily unavailable';
    }
}

function extractArtistName(eventName) {
    // Try to extract artist name from event name
    // Look for patterns like "Artist Name - Event" or "Event by Artist Name"
    if (eventName.includes(' - ')) {
        const parts = eventName.split(' - ');
        return parts[parts.length - 1].trim(); // Take the last part as artist
    } else if (eventName.includes(' by ')) {
        const parts = eventName.split(' by ');
        return parts[parts.length - 1].trim(); // Take the part after "by"
    } else if (eventName.includes(' with ')) {
        const parts = eventName.split(' with ');
        return parts[parts.length - 1].trim(); // Take the part after "with"
    }
    
    // If no clear pattern, return null to use default
    return null;
}

function populateCalendar(eventData) {
    const calendarContent = document.getElementById('calendar-content');
    
    // Filter out events that are more than 1 day in the past
    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - (24 * 60 * 60 * 1000));
    
    const upcomingEvents = eventData.events.filter(event => {
        const eventDate = event.datetime ? new Date(event.datetime) : new Date(event.date);
        return !isNaN(eventDate.getTime()) && eventDate >= oneDayAgo;
    });
    
    // Sort events by datetime - upcoming events first (closest to now)
    const sortedEvents = upcomingEvents.sort((a, b) => {
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
    
    // If no upcoming events, show a message
    if (sortedEvents.length === 0) {
        calendarContent.innerHTML = `
            <div class="calendar-title">★ NO UPCOMING TRANSMISSIONS ★</div>
            <div class="calendar-note">
                Check back soon for new events!
            </div>
        `;
        return;
    }
    
    let html = `

        <table class="calendar-table">
            <thead>
                <tr>
                    <th>Date/Time</th>
                    <th>Event</th>
                    <th>Description</th>
                </tr>
            </thead>
            <tbody>
    `;
    
    sortedEvents.forEach(event => {
        // Handle both new datetime format and legacy date format
        let displayDate = event.date;
        
        // If we have a datetime field, format it nicely for the table
        if (event.datetime) {
            try {
                const date = new Date(event.datetime);
                displayDate = date.toLocaleString('en-US', {
                    weekday: 'short',
                    month: 'short',
                    day: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit',
                    hour12: true
                });
            } catch (e) {
                console.warn('Could not parse datetime:', event.datetime);
                // Fall back to the date field
                displayDate = event.date;
            }
        }
        
        html += `
            <tr>
                <td class="event-date">${displayDate}</td>
                <td class="event-name">${event.name}</td>
                <td class="event-type">${event.type}</td>
            </tr>
        `;
    });
    
    html += `
            </tbody>
        </table>
    `;
    
    calendarContent.innerHTML = html;
}

// Load calendar when page loads
document.addEventListener('DOMContentLoaded', loadEventCalendar);
