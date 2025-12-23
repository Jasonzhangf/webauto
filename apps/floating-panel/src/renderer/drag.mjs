let isDragging = false;
let dragOffset = { x: 0, y: 0 };
let dragArea = null;

export function initDrag(element) {
  dragArea = element;
  if (!dragArea) return;
  // Native Electron drag region handles the dragging, no JS needed
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
  
  if (!dragArea) return;

  isDragging = true;
  const rect = dragArea.getBoundingClientRect();
  dragOffset.x = e.clientX - rect.left;
  dragOffset.y = e.clientY - rect.top;
  
  dragArea.style.cursor = 'grabbing';
  
  // Bring window to front
  dragArea.style.zIndex = '9999';
}

function drag(e) {
  if (!isDragging) return;
  
  const x = e.clientX - dragOffset.x;
  const y = e.clientY - dragOffset.y;
  window.moveTo(x, y);
  
  // Prevent default to avoid text selection
  e.preventDefault();
}

function stopDrag(e) {
  if (!isDragging) return;
  
  isDragging = false;
  if (!dragArea) return;

  dragArea.style.cursor = 'default';
  
  // Reset z-index after a short delay
  setTimeout(() => {
    dragArea.style.zIndex = '1000';
  }, 100);
}
