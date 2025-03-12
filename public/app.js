// Public/app.js

document.addEventListener('DOMContentLoaded', function() {
    // Elements
    const uploadForm = document.getElementById('uploadForm');
    const queryForm = document.getElementById('queryForm');
    const documentList = document.getElementById('documentList');
    const documentSelect = document.getElementById('document');
    const resultsSection = document.getElementById('results');
    const answerElement = document.getElementById('answer');
    const chunksContainer = document.getElementById('chunksContainer');
    const loadingIndicator = document.getElementById('loading');
    
    // Load documents on page load
    loadDocuments();
    
    // Event listeners
    uploadForm.addEventListener('submit', handleDocumentUpload);
    queryForm.addEventListener('submit', handleQuery);
    
    // Functions
    async function loadDocuments() {
      try {
        const response = await fetch('/api/documents');
        const documents = await response.json();
        
        renderDocumentList(documents);
        populateDocumentSelect(documents);
      } catch (error) {
        console.error('Error loading documents:', error);
        showError('Failed to load documents');
      }
    }
    
    function renderDocumentList(documents) {
      if (!documents || documents.length === 0) {
        documentList.innerHTML = '<li class="py-3 flex justify-between text-sm text-gray-500">No documents uploaded yet</li>';
        return;
      }
      
      documentList.innerHTML = documents.map(doc => `
        <li class="py-3 flex justify-between items-center" data-id="${doc.id}">
          <span class="text-sm font-medium text-gray-900">${doc.title}</span>
          <button class="delete-document text-xs text-red-600 hover:text-red-900" data-id="${doc.id}">
            Delete
          </button>
        </li>
      `).join('');
      
      // Add event listeners to delete buttons
      document.querySelectorAll('.delete-document').forEach(button => {
        button.addEventListener('click', async (e) => {
          const docId = e.target.dataset.id;
          if (confirm('Are you sure you want to delete this document?')) {
            await deleteDocument(docId);
          }
        });
      });
    }
    
    function populateDocumentSelect(documents) {
      documentSelect.innerHTML = '<option value="">All Documents</option>';
      
      if (documents && documents.length > 0) {
        documents.forEach(doc => {
          const option = document.createElement('option');
          option.value = doc.id;
          option.textContent = doc.title;
          documentSelect.appendChild(option);
        });
      }
    }
    
    async function handleDocumentUpload(e) {
      e.preventDefault();
      
      const formData = new FormData(uploadForm);
      
      // Validate
      const file = formData.get('file');
      if (!file || file.size === 0) {
        showError('Please select a file to upload');
        return;
      }
      
      // Show loading
      setLoading(true);
      
      try {
        const response = await fetch('/api/documents', {
          method: 'POST',
          body: formData
        });
        
        if (!response.ok) {
          throw new Error('Failed to upload document');
        }
        
        const result = await response.json();
        showSuccess(`Document "${result.document.title}" processed successfully`);
        
        // Reset form
        uploadForm.reset();
        
        // Refresh document list
        loadDocuments();
      } catch (error) {
        console.error('Error uploading document:', error);
        showError('Failed to upload document');
      } finally {
        setLoading(false);
      }
    }
    
    async function deleteDocument(id) {
      try {
        const response = await fetch(`/api/documents/${id}`, {
          method: 'DELETE'
        });
        
        if (!response.ok) {
          throw new Error('Failed to delete document');
        }
        
        showSuccess('Document deleted successfully');
        loadDocuments();
      } catch (error) {
        console.error('Error deleting document:', error);
        showError('Failed to delete document');
      }
    }
    
    async function handleQuery(e) {
      e.preventDefault();
      
      const query = document.getElementById('query').value.trim();
      const documentId = document.getElementById('document').value;
      
      if (!query) {
        showError('Please enter a question');
        return;
      }
      
      // Hide previous results and show loading
      resultsSection.classList.add('hidden');
      setLoading(true);
      
      try {
        const response = await fetch('/api/query', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            query,
            documentId: documentId || null
          })
        });
        
        if (!response.ok) {
          throw new Error('Failed to process query');
        }
        
        const result = await response.json();
        renderResults(result, query);
      } catch (error) {
        console.error('Error processing query:', error);
        showError('Failed to process query');
      } finally {
        setLoading(false);
      }
    }
    
    function renderResults(result, query) {
      // Display answer
      answerElement.innerHTML = result.answer;
      
      // Display chunks
      renderChunks(result.all_chunks, result.used_chunks);
      
      // Show results section
      resultsSection.classList.remove('hidden');
      
      // Scroll to results
      resultsSection.scrollIntoView({ behavior: 'smooth' });
    }
    
    function renderChunks(chunks, usedChunkIds) {
      chunksContainer.innerHTML = '';
      
      chunks.forEach((chunk, index) => {
        const isUsed = usedChunkIds.includes(chunk.id);
        const chunkElement = document.createElement('div');
        chunkElement.className = `p-4 rounded-md border ${isUsed ? 'border-green-500 bg-green-50' : 'border-gray-300'}`;
        
        // Create chunk header with similarity score
        const header = document.createElement('div');
        header.className = 'flex justify-between items-center mb-2';
        
        const rankBadge = document.createElement('span');
        rankBadge.className = `inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${isUsed ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`;
        rankBadge.innerHTML = `Rank: ${index + 1}`;
        
        const scoreBadge = document.createElement('span');
        scoreBadge.className = 'text-xs text-gray-500';
        scoreBadge.innerHTML = `Similarity: ${(chunk.similarity * 100).toFixed(2)}%`;
        
        header.appendChild(rankBadge);
        header.appendChild(scoreBadge);
        
        // Create chunk content
        const content = document.createElement('div');
        content.className = 'text-sm text-gray-700';
        content.innerHTML = chunk.text;
        
        // Add used badge for chunks that were sent to Claude
        if (isUsed) {
          const usedBadge = document.createElement('div');
          usedBadge.className = 'mt-2 text-xs font-medium text-green-700';
          usedBadge.innerHTML = 'Used for answer generation';
          chunkElement.appendChild(usedBadge);
        }
        
        chunkElement.appendChild(header);
        chunkElement.appendChild(content);
        chunksContainer.appendChild(chunkElement);
      });
    }
    
    function setLoading(isLoading) {
      if (isLoading) {
        loadingIndicator.classList.remove('hidden');
      } else {
        loadingIndicator.classList.add('hidden');
      }
    }
    
    function showError(message) {
      alert(message);
    }
    
    function showSuccess(message) {
      alert(message);
    }
  });