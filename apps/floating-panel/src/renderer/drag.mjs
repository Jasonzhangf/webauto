let isDragging = false;
let dragOffset = { x: 0, y: 0 };

export function initDrag(window) {
  window.addEventListener('mousedown', startDrag);
  window.addEventListener('mousemove', drag);
  window.addEventListener('mouseup', stopDrag);
  
  // Prevent text selection during drag
  window.addEventListener('selectstart', (e) => {
    if (isDragging) e.preventDefault();
  });
}

function startDrag(e) {
  // Only drag on title bar or empty areas, not on buttons or content
  if (e.target.tagName === 'BUTTON' || 
      e.target.closest('button') ||
      e.target.closest('#containerTree') ||
      e.target.closest('#domTree') ||
      e.target.closest('#events')) {
    return;
  }
  
  isDragging = true;
  const rect = window.getBoundingClientRect();
  dragOffset.x = e.clientX - rect.left;
  dragOffset.y = e.clientY - rect.top;
  
  window.style.cursor = 'grabbing';
  
  // Bring window to front
  window.style.zIndex = '9999';
}

function drag(e) {
  if (!isDragging) return;
  
  const x = e.clientX - dragOffset.x;
  const y = e.clientY - dragOffset.y;
  
  // Constrain to screen bounds
  const screenWidth = window.screen.availWidth;
  const screenHeight = window.screen.availHeight;
  const windowWidth = window.outerWidth;
  const windowHeight = window.outerHeight;
  
  const constrainedX = Math.max(0, Math.min(x, screenWidth - windowWidth));
  const constrainedY = Math.max(0, Math.min(y, screenHeight - windowHeight));
  
  window.moveTo(constrainedX, constrainedY);
  
  // Prevent default to avoid text selection
  e.preventDefault();
}

function stopDrag(e) {
  if (!isDragging) return;
  
  isDragging = false;
  window.style.cursor = 'default';
  
  // Reset z-index after a short delay
  setTimeout(() => {
    window.style.zIndex = '1000';
  }, 100);
}
