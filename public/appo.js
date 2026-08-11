document.addEventListener('DOMContentLoaded', () => {
  const dropZone = document.getElementById('drop-zone');
  const fileInput = document.getElementById('file-input');
  const browseBtn = document.getElementById('browse-btn');
  const filePreviewCard = document.getElementById('file-preview-card');
  const mediaPreview = document.getElementById('media-preview');
  const fileName = document.getElementById('file-name');
  const fileMeta = document.getElementById('file-meta');
  const uploadBtn = document.getElementById('upload-btn');
  const progressContainer = document.getElementById('progress-container');
  const progressBar = document.getElementById('progress-bar');
  const errorMessage = document.getElementById('error-message');
  const resultCard = document.getElementById('result-card');
  const resultUrl = document.getElementById('result-url');
  const copyBtn = document.getElementById('copy-btn');
  const resetBtn = document.getElementById('reset-btn');

  let selectedFile = null;

  // Gestion du Drag & Drop
  ['dragenter', 'dragover'].forEach(eventName => {
    dropZone.addEventListener(eventName, (e) => {
      e.preventDefault();
      dropZone.classList.add('dragover');
    }, false);
  });

  ['dragleave', 'drop'].forEach(eventName => {
    dropZone.addEventListener(eventName, (e) => {
      e.preventDefault();
      dropZone.classList.remove('dragover');
    }, false);
  });

  dropZone.addEventListener('drop', (e) => {
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleFileSelection(files[0]);
    }
  });

  fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
      handleFileSelection(e.target.files[0]);
    }
  });

  function handleFileSelection(file) {
    hideError();
    selectedFile = file;

    // Affichage des métadonnées
    fileName.textContent = file.name;
    fileMeta.textContent = `${formatBytes(file.size)} • ${file.type || 'Inconnu'}`;

    // Prévisualisation graphique
    mediaPreview.innerHTML = '';
    if (file.type.startsWith('image/')) {
      const img = document.createElement('img');
      img.src = URL.createObjectURL(file);
      mediaPreview.appendChild(img);
    } else if (file.type.startsWith('video/')) {
      mediaPreview.textContent = '🎥';
    } else if (file.type.startsWith('audio/')) {
      mediaPreview.textContent = '🎵';
    } else {
      mediaPreview.textContent = '📄';
    }

    dropZone.classList.add('hidden');
    filePreviewCard.classList.remove('hidden');
  }

  // Upload du fichier via XMLHttpRequest (permet d'observer le progrès)
  uploadBtn.addEventListener('click', () => {
    if (!selectedFile) return;

    uploadBtn.disabled = true;
    uploadBtn.textContent = 'Upload en cours...';
    progressContainer.classList.remove('hidden');
    progressBar.style.width = '0%';

    const formData = new FormData();
    formData.append('fileToUpload', selectedFile);

    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/upload', true);

    // Progression du chargement
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        const percentComplete = Math.round((e.loaded / e.total) * 100);
        progressBar.style.width = percentComplete + '%';
        if (percentComplete === 100) {
          // Traitement backend en cours vers Catbox
          progressBar.classList.add('animated');
          uploadBtn.textContent = 'Envoi vers Catbox...';
        }
      }
    }

    xhr.onload = function () {
      progressBar.classList.remove('animated');
      let response = {};
      try {
        response = JSON.parse(xhr.responseText);
      } catch (err) {
        response = { success: false, error: 'Réponse serveur invalide.' };
      }

      if (xhr.status === 200 && response.success) {
        filePreviewCard.classList.add('hidden');
        resultUrl.value = response.url;
        resultCard.classList.remove('hidden');
      } else {
        showError(response.error || 'Une erreur est survenue pendant l’upload.');
        resetUploadUI();
      }
    };

    xhr.onerror = function () {
      progressBar.classList.remove('animated');
      showError('Erreur réseau ou connexion interrompue.');
      resetUploadUI();
    };

    xhr.send(formData);
  });

  // Copie dans le presse-papier avec fallback
  copyBtn.addEventListener('click', async () => {
    const url = resultUrl.value;
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(url);
      } else {
        // Fallback navigateurs plus anciens / HTTP non sécurisé
        resultUrl.select();
        document.execCommand('copy');
      }
      copyBtn.textContent = 'Lien copié !';
      copyBtn.style.backgroundColor = 'var(--success)';
      setTimeout(() => {
        copyBtn.textContent = 'Copier le lien';
        copyBtn.style.backgroundColor = '';
      }, 2000);
    } catch (err) {
      showError('Impossible de copier le lien.');
    }
  });

  // Réinitialisation complète
  resetBtn.addEventListener('click', resetAll);

  function resetUploadUI() {
    uploadBtn.disabled = false;
    uploadBtn.textContent = 'Upload';
    progressContainer.classList.add('hidden');
    progressBar.style.width = '0%';
  }

  function resetAll() {
    selectedFile = null;
    fileInput.value = '';
    resetUploadUI();
    resultCard.classList.add('hidden');
    filePreviewCard.classList.add('hidden');
    dropZone.classList.remove('hidden');
    hideError();
  }

  function showError(msg) {
    errorMessage.textContent = msg;
    errorMessage.classList.remove('hidden');
  }

  function hideError() {
    errorMessage.classList.add('hidden');
  }

  function formatBytes(bytes) {
    if (bytes === 0) return '0 Octet';
    const k = 1024;
    const sizes = ['Octets', 'Ko', 'Mo', 'Go'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
});
