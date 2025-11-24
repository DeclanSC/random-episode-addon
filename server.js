const { addonBuilder, serveHTTP } = require('stremio-addon-sdk');
const express = require('express');

const builder = new addonBuilder(require('./manifest.json'));

// Cache for metadata to reduce requests to Cinemeta
const cache = new Map();
const CACHE_TTL = 1000 * 60 * 30; // 30 minutes

builder.defineMetaHandler(async (args) => {
  if (args.type !== 'series') {
    return { meta: null };
  }

  const cacheKey = `${args.type}/${args.id}`;
  const cached = cache.get(cacheKey);
  
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return { meta: cached.data };
  }

  try {
    console.log(`Fetching metadata for: ${args.id}`);
    const cinemetaResponse = await fetch(`https://v3-cinemeta.strem.io/meta/${args.type}/${args.id}.json`);
    
    if (!cinemetaResponse.ok) {
      console.log(`Cinemeta response not OK: ${cinemetaResponse.status}`);
      return { meta: null };
    }
    
    const cinemetaData = await cinemetaResponse.json();

    if (!cinemetaData.meta?.videos?.length) {
      console.log(`No videos found for: ${args.id}`);
      return { meta: null };
    }

    // Filter out trailers and non-episode content
    const episodes = cinemetaData.meta.videos.filter(video => 
      video.season && video.episode && video.title
    );

    if (episodes.length === 0) {
      console.log(`No valid episodes found for: ${args.id}`);
      return { meta: null };
    }

    const randomEpisode = episodes[Math.floor(Math.random() * episodes.length)];
    console.log(`Selected random episode: S${randomEpisode.season}E${randomEpisode.episode} - ${randomEpisode.title}`);
    
    const enhancedMeta = {
      ...cinemetaData.meta,
      links: [
        {
          name: '🎲 Random Episode',
          category: 'other',
          url: `stremio:///detail/series/${args.id}/${randomEpisode.season}/${randomEpisode.id}`
        },
        ...(cinemetaData.meta.links || [])
      ]
    };

    // Cache the result
    cache.set(cacheKey, {
      data: enhancedMeta,
      timestamp: Date.now()
    });

    return { meta: enhancedMeta };

  } catch (error) {
    console.error('Error fetching from Cinemeta:', error);
    return { meta: null };
  }
});

// Create express app for better Replit compatibility
const app = express();

// Add CORS headers
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  next();
});

// Health check endpoint
app.get('/', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'Stremio Random Episode Addon',
    endpoints: {
      manifest: '/manifest.json',
      health: '/health'
    }
  });
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// Serve manifest
app.get('/manifest.json', (req, res) => {
  res.json(require('./manifest.json'));
});

// Start the Stremio addon server
const port = process.env.PORT || 3000;

serveHTTP(builder.getInterface(), { port }, (err, addonUrl) => {
  if (err) {
    console.error('Error serving Stremio addon:', err);
    process.exit(1);
  }
  
  console.log(`🎬 Stremio Random Episode Addon running at: ${addonUrl}`);
  console.log(`🌐 Health check available at: http://localhost:${port}/`);
  console.log(`📄 Manifest available at: http://localhost:${port}/manifest.json`);
  
  // Also start the express server on the same port
  const interfaceRouter = builder.getInterface();
  app.use(interfaceRouter);
  
  app.listen(port, () => {
    console.log(`🚀 Server started on port ${port}`);
    console.log(`💡 Install in Stremio using: ${addonUrl}/manifest.json`);
  });
});

// Clean cache periodically
setInterval(() => {
  const now = Date.now();
  let cleaned = 0;
  for (const [key, value] of cache.entries()) {
    if (now - value.timestamp > CACHE_TTL) {
      cache.delete(key);
      cleaned++;
    }
  }
  if (cleaned > 0) {
    console.log(`🧹 Cleaned ${cleaned} expired cache entries`);
  }
}, 1000 * 60 * 60); // Clean every hour

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('🛑 Shutting down addon...');
  process.exit(0);
});
