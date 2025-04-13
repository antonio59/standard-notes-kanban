// script.js
document.addEventListener('DOMContentLoaded', () => {
    const kanbanBoard = document.getElementById('kanban-board');
    let streamObserver = null; // To store the stream observer function
    let componentManager = null; // To store the component manager instance
    let currentNotes = []; // Store the notes data locally

    // --- Configuration ---
    const KANBAN_TAG_PREFIX = 'kanban:'; // Notes must have a tag starting with this
    const DEFAULT_COLUMNS = ['todo', 'inprogress', 'done']; // Default columns if no tagged notes found

    // --- Standard Notes Communication ---

    // Function to request items (notes) from Standard Notes
    function requestItems() {
        if (componentManager) {
            // Request all notes. You might refine this later based on performance.
            // We need tags, so include 'items' relation.
            componentManager.requestItems(
                ['Note'], // Content types to request
                // No specific uuids, get all matching types
            );
        }
    }

    // Function to save updated notes back to Standard Notes
    function saveNoteChanges(notesToSave) {
        if (componentManager) {
            console.log('Saving notes:', notesToSave);
            // Make sure we send valid SN item structures
            const itemsToSave = notesToSave.map(note => ({
                uuid: note.uuid,
                content_type: note.content_type,
                content: note.content,
                created_at: note.created_at, // Include timestamps if you have them
                updated_at: new Date().toISOString(), // Update timestamp
                tags: note.tags.map(tag => ({ // Ensure tags are in the correct format
                    uuid: tag.uuid,
                    title: tag.title,
                    content_type: 'Tag'
                }))
                // Include other necessary fields if they exist on your note objects
            }));
            componentManager.saveItems(itemsToSave);
        } else {
            console.error("Component Manager not initialized. Cannot save changes.");
        }
    }

    // Initialize communication with Standard Notes
    function initializeSNComponent() {
        // See Standard Notes documentation for SNComponentManager
        // This simplified version assumes it's available globally or via import if using modules
        // The actual mechanism involves message passing as shown below.

        // Listen for messages from the Standard Notes application
        window.addEventListener('message', (event) => {
            // IMPORTANT: Verify the origin for security in production!
            // if (event.origin !== 'expected_standard_notes_origin') return;

            const message = event.data;
            console.log("Received message from SN:", message);

            if (!message) return;

            // Check if the message contains component data (like notes)
            if (message.action === 'componentData') {
                if (message.data.componentData) {
                     // The componentData might be nested depending on SN version/context
                    const data = message.data.componentData.standardNotes || message.data.componentData;
                    if (data && data.items) {
                        handleReceivedItems(data.items);
                    }
                } else if (message.data.items) {
                     // Sometimes items might be directly in data
                     handleReceivedItems(message.data.items);
                }
            }

            // Check if the message is providing the communication manager
            // The exact structure might vary slightly based on SN versions. Adapt as needed.
            if (message.action === 'streamContextItem' || message.action === 'setComponentData') {
                 // In newer versions, you might get a 'session' object for communication
                 // For simplicity, we'll simulate having a manager object derived from the message
                 // This part NEEDS to align with the actual SN Plugin API for communication
                 if (!componentManager) {
                     componentManager = {
                         // Define methods based on postMessage structure
                         requestItems: (contentTypes) => {
                             window.parent.postMessage({
                                 action: 'requestItems',
                                 data: { contentTypes },
                                 messageId: Math.random().toString(36).substring(7) // Unique ID for tracking responses if needed
                             }, '*'); // Use specific origin in production
                         },
                         saveItems: (items) => {
                             window.parent.postMessage({
                                 action: 'saveItems',
                                 data: { items },
                                 messageId: Math.random().toString(36).substring(7)
                             }, '*'); // Use specific origin in production
                         },
                         // Add other methods like selectNote, etc. if needed
                     };
                     console.log("Component Manager Initialized (simulated)");
                     // Initial request for notes once manager is ready
                     requestItems();
                 }
            }
        });

         // Signal to SN that the component is ready
         window.parent.postMessage({ action: 'componentReady', data: {} }, '*'); // Use specific origin in production!
         console.log("Component Ready message sent.");

         // --- Fallback/Initial Request (if message listener setup is slow) ---
         // Sometimes needed to kickstart communication
         setTimeout(() => {
             if (!componentManager) {
                 console.warn("Component manager not received after timeout, attempting initial request anyway.");
                  window.parent.postMessage({ action: 'requestComponentData', data: {} }, '*');
             }
         }, 1000); // Adjust timeout as needed
    }


    // Process the notes received from Standard Notes
    function handleReceivedItems(items) {
        console.log("Processing items:", items);
        // Filter for 'Note' items and process tags
        currentNotes = items
            .filter(item => item.content_type === 'Note')
            .map(note => ({
                ...note,
                // Ensure tags are always an array and simplify structure
                tags: (note.tags || []).map(tagRef => {
                   // Find the full tag object in the received items
                   const fullTag = items.find(t => t.uuid === tagRef.uuid && t.content_type === 'Tag');
                   return fullTag ? { uuid: fullTag.uuid, title: fullTag.title } : null;
                }).filter(tag => tag !== null) // Remove nulls if tag wasn't found
            }));

        console.log("Processed notes:", currentNotes);
        renderBoard(currentNotes);
    }

    // --- Rendering Logic ---

    function renderBoard(notes) {
        kanbanBoard.innerHTML = ''; // Clear previous board state

        const columns = determineColumns(notes);

        columns.forEach(column => {
            const columnElement = createColumnElement(column.id, column.title);
            kanbanBoard.appendChild(columnElement);

            const cardsContainer = columnElement.querySelector('.cards-container');
            const columnNotes = notes.filter(note =>
                note.tags.some(tag => tag.title === column.id)
            );

            columnNotes.forEach(note => {
                const cardElement = createCardElement(note.uuid, note.content.title || 'Untitled Note');
                cardsContainer.appendChild(cardElement);
            });
        });

        setupDragAndDrop(); // Re-attach drag listeners after rendering
    }

    function determineColumns(notes) {
        const columnTags = new Set();
        notes.forEach(note => {
            note.tags.forEach(tag => {
                if (tag.title.startsWith(KANBAN_TAG_PREFIX)) {
                    columnTags.add(tag.title);
                }
            });
        });

        // If no Kanban tags found, use defaults
        if (columnTags.size === 0) {
            return DEFAULT_COLUMNS.map(col => ({
                id: KANBAN_TAG_PREFIX + col,
                title: col
            }));
        }

        // Convert Set to array and create column objects
        return Array.from(columnTags).sort().map(tagTitle => ({
            id: tagTitle,
            title: tagTitle.substring(KANBAN_TAG_PREFIX.length) // Display name without prefix
        }));
    }


    function createColumnElement(id, title) {
        const column = document.createElement('div');
        column.className = 'kanban-column';
        column.dataset.columnId = id; // Store the full tag title (e.g., 'kanban:todo')
        column.innerHTML = `
            <h2>${title}</h2>
            <div class="cards-container"></div>
        `;
        return column;
    }

    function createCardElement(noteId, title) {
        const card = document.createElement('div');
        card.className = 'kanban-card';
        card.draggable = true;
        card.dataset.noteId = noteId;
        card.textContent = title;
        return card;
    }

    // --- Drag and Drop Logic ---

    function setupDragAndDrop() {
        const cards = document.querySelectorAll('.kanban-card');
        const columns = document.querySelectorAll('.kanban-column');
        let draggedItem = null; // Keep track of the item being dragged

        cards.forEach(card => {
            card.addEventListener('dragstart', (e) => {
                draggedItem = card;
                setTimeout(() => card.classList.add('dragging'), 0); // Style while dragging
                e.dataTransfer.setData('text/plain', card.dataset.noteId); // Store note ID
                console.log(`Drag Start: Note ID ${card.dataset.noteId}`);
            });

            card.addEventListener('dragend', () => {
                if (draggedItem) {
                    draggedItem.classList.remove('dragging');
                }
                draggedItem = null;
                console.log("Drag End");
            });
        });

        columns.forEach(column => {
            column.addEventListener('dragover', (e) => {
                e.preventDefault(); // Necessary to allow dropping
                column.classList.add('drag-over');
            });

            column.addEventListener('dragenter', (e) => {
                e.preventDefault();
                 // Optional: Additional visual feedback on enter
            });

            column.addEventListener('dragleave', () => {
                column.classList.remove('drag-over');
            });

            column.addEventListener('drop', (e) => {
                e.preventDefault();
                column.classList.remove('drag-over');

                if (!draggedItem) return; // Should not happen if dragstart worked

                const noteId = e.dataTransfer.getData('text/plain');
                const targetColumnId = column.dataset.columnId; // e.g., "kanban:done"
                const sourceColumn = draggedItem.closest('.kanban-column');
                const sourceColumnId = sourceColumn ? sourceColumn.dataset.columnId : null;

                console.log(`Drop: Note ID ${noteId} onto Column ${targetColumnId} from ${sourceColumnId}`);


                if (targetColumnId !== sourceColumnId) {
                    // 1. Find the note in our local data
                    const noteToUpdate = currentNotes.find(note => note.uuid === noteId);

                    if (noteToUpdate) {
                        // 2. Update the note's tags
                        // Remove old Kanban tag(s)
                        const nonKanbanTags = noteToUpdate.tags.filter(tag => !tag.title.startsWith(KANBAN_TAG_PREFIX));

                        // Find or create the new Kanban tag object.
                        // IMPORTANT: For saving, we need the *full tag objects* if they exist,
                        // otherwise SN might duplicate tags. This requires finding the tag's UUID.
                        // For simplicity here, we'll just update the title. A robust solution
                        // needs access to the full tag list from handleReceivedItems.
                        // Let's assume we have access to all tags for lookup.
                        const allTags = currentNotes.flatMap(n => n.tags); // Simplified - better to store allTag items separately
                        let targetTagObject = allTags.find(t => t.title === targetColumnId);

                        // If the target tag doesn't exist yet in *any* note, we might need to create it.
                        // Standard Notes handles tag creation implicitly when saving notes with new tag titles,
                        // but doesn't provide a UUID beforehand. We send only the title.
                        if (!targetTagObject) {
                            targetTagObject = { title: targetColumnId }; // No UUID, SN will create
                        } else {
                             // Use existing tag structure
                            targetTagObject = { uuid: targetTagObject.uuid, title: targetTagObject.title };
                        }

                        const updatedTags = [...nonKanbanTags, targetTagObject];

                        // Create a *new* object for the update to avoid mutation issues
                        const updatedNote = {
                             ...noteToUpdate,
                             tags: updatedTags
                         };

                        // 3. Send the updated note back to Standard Notes
                        saveNoteChanges([updatedNote]);

                        // 4. Optimistic UI Update: Move the card visually immediately
                        const cardsContainer = column.querySelector('.cards-container');
                        cardsContainer.appendChild(draggedItem);

                        // 5. Update local state (important if re-rendering often)
                        currentNotes = currentNotes.map(note =>
                            note.uuid === noteId ? updatedNote : note
                        );

                    } else {
                        console.error(`Note with ID ${noteId} not found in local data.`);
                    }
                }
                draggedItem = null; // Clear dragged item reference
            });
        });
    }

    // --- Start Initialization ---
    initializeSNComponent();

});