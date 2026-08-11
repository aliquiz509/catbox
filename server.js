const express = require('express');
const multer = require('multer');
const axios = require('axios');
const FormData = require('form-data');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Indiquer à Express qu'il est derrière un Reverse Proxy (Render, Vercel, Railway)
// Nécessaire pour éviter l'erreur ERR_ERL_UNEXPECTED_X_FORWARDED_FOR
app.set('trust proxy', 1);

// En-têtes de sécurité
app.use(helmet({
  contentSecurityPolicy: false // Permet le chargement des ressources locales et externes
}));

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Limitation de débit : Max 30 requêtes par 15 minutes par IP sur /api/
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: { success: false, error: 'Trop de requêtes. Veuillez réessayer dans 15 minutes.' }
});
app.use('/api/', limiter);

// Configuration Multer : Stockage en mémoire (RAM) pour compatibilité Serverless/Render/VPS
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 200 * 1024 * 1024 // Limite stricte : 200 Mo (Catbox max)
  },
  fileFilter: (req, file, cb) => {
    // Liste blanche des MIME types supportés
    const allowedMimeTypes = [
      // Images
      'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
      // Vidéos
      'video/mp4', 'video/webm', 'video/quicktime',
      // Audio
      'audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/x-m4a', 'audio/mp4',
      // Documents & Archives
      'application/pdf', 'text/plain', 'application/zip', 'application/x-rar-compressed',
      'application/json', 'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ];

    if (allowedMimeTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Type de fichier non autorisé. Seuls les images, vidéos, audios et documents courants sont acceptés.'));
    }
  }
});

// Endpoint principal d'upload
app.post('/api/upload', (req, res) => {
  upload.single('fileToUpload')(req, res, async (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ success: false, error: 'Le fichier dépasse la limite maximale de 200 Mo.' });
      }
      return res.status(400).json({ success: false, error: `Erreur d'upload : ${err.message}` });
    } else if (err) {
      return res.status(400).json({ success: false, error: err.message });
    }

    if (!req.file) {
      return res.status(400).json({ success: false, error: 'Aucun fichier sélectionné.' });
    }

    try {
      // Préparation du formulaire multipart vers Catbox
      const form = new FormData();
      form.append('reqtype', 'fileupload');
      
      // Si une clé utilisateur existe, on l'attache (optionnel)
      if (process.env.CATBOX_USERHASH) {
        form.append('userhash', process.env.CATBOX_USERHASH);
      }

      // Nettoyage du nom de fichier contre le path traversal
      const safeFilename = path.basename(req.file.originalname);

      form.append('fileToUpload', req.file.buffer, {
        filename: safeFilename,
        contentType: req.file.mimetype
      });

      // Envoi de la requête à l'API Catbox avec User-Agent explicite
      const response = await axios.post('https://catbox.moe/user/api.php', form, {
        headers: {
          ...form.getHeaders(),
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        },
        timeout: 120000 // 2 minutes de timeout
      });

      const catboxUrl = response.data ? response.data.trim() : '';

      // Vérification du résultat
      if (catboxUrl.startsWith('https://files.catbox.moe/')) {
        return res.json({ success: true, url: catboxUrl });
      } else {
        console.error('Réponse Catbox inattendue :', response.data);
        return res.status(502).json({ 
          success: false, 
          error: 'Le service Catbox a retourné une réponse invalide ou une erreur.' 
        });
      }

    } catch (error) {
      console.error('Erreur lors du transfert vers Catbox :', error.message);
      
      if (error.code === 'ECONNABORTED') {
        return res.status(504).json({ success: false, error: 'Délai d’attente dépassé (timeout) lors de l’envoi vers Catbox.' });
      }

      return res.status(500).json({ 
        success: false, 
        error: 'Impossible de joindre le serveur Catbox. Veuillez réessayer plus tard.' 
      });
    }
  });
});

// Capture des erreurs globales non gérées
app.use((err, req, res, next) => {
  console.error('Erreur interne :', err.stack);
  res.status(500).json({ success: false, error: 'Une erreur interne est survenue sur le serveur.' });
});

app.listen(PORT, () => {
  console.log(`Serveur démarré sur http://localhost:${PORT}`);
});
