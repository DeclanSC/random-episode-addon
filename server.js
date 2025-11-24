const { addonBuilder, serveHTTP } = require('stremio-addon-sdk');

// Create addon builder
const builder = new addonBuilder({
  "id": "com.stremio.random.episode",
  "version": "1.0.0",
  "name": "Random Episode Button",
  "description": "Adds a Random Episode button to TV series detail pages",
  "resources": ["meta"],
  "types": ["series"],
  "idPrefixes": ["tt"]
});

// Cache for metadata
const cache = new Map();
const CACHE_TTL = 1000 * 60 * 30; // 30 minutes

// Define meta handler - this is what adds the random episode button
builder.defineMetaHandler(async (args) => {
  console.log(`🔍 Meta handler called:`, { type: args.type, id: args.id });
  
  // Only handle series
  if (args.type !== 'series') {
    console.log(`❌ Not a series, skipping`);
    return { meta: null };
  }

  const cacheKey = `${args.type}/${args.id}`;
  
  // Check cache
  if (cache.has(cacheKey)) {
    const cached = cache.get(cacheKey);
    if (Date.now() - cached.timestamp < CACHE_TTL) {
      console.log(`✅ Returning cached data for ${args.id}`);
      return { meta: cached.data };
    }
  }

  try {
    console.log(`📡 Fetching from Cinemeta for: ${args.id}`);
    
    const cinemetaResponse = await fetch(`https://v3-cinemeta.strem.io/meta/${args.type}/${args.id}.json`);
    
    if (!cinemetaResponse.ok) {
      console.log(`❌ Cinemeta error: ${cinemetaResponse.status}`);
      return { meta: null };
    }
    
    const cinemetaData = await cinemetaResponse.json();
    
    if (!cinemetaData.meta || !cinemetaData.meta.videos || !Array.isArray(cinemetaData.meta.videos)) {
      console.log(`❌ No videos array in response`);
      return { meta: null };
    }

    console.log(`📺 Found ${cinemetaData.meta.videos.length} videos`);

    // Filter valid episodes (with season and episode numbers)
    const episodes = cinemetaData.meta.videos.filter(video => 
      video && 
      typeof video.season === 'number' && 
      typeof video.episode === 'number' &&
      video.title
    );

    console.log(`🎯 ${episodes.length} valid episodes after filtering`);

    if (episodes.length === 0) {
      console.log(`❌ No valid episodes found`);
      return { meta: null };
    }

    // Select random episode
    const randomEpisode = episodes[Math.floor(Math.random() * episodes.length)];
    console.log(`🎲 Selected: S${randomEpisode.season}E${randomEpisode.episode} - "${randomEpisode.title}"`);

    // Create enhanced meta with random episode link
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

    console.log(`✅ Successfully enhanced meta with random episode button`);
    return { meta: enhancedMeta };

  } catch (error) {
    console.error('💥 Error in meta handler:', error);
    return { meta: null };
  }
});

// Start the server
const port = process.env.PORT || 3000;

serveHTTP(builder.getInterface(), { port }, (err, url) => {
  if (err) {
    console.error('❌ Failed to start server:', err);
    process.exit(1);
  }
  
  console.log(`🚀 Stremio Random Episode Addon running!`);
  console.log(`📄 Addon URL: ${url}`);
  console.log(`📋 Manifest: ${url}/manifest.json`);
  
  // Test URLs
  console.log(`\n🧪 Test these URLs in your browser:`);
  console.log(`Game of Thrones: ${url}/meta/series/tt0944947.json`);
  console.log(`Breaking Bad: ${url}/meta/series/tt0903747.json`);
  console.log(`The Office: ${url}/meta/series/tt0386676.json`);
});

// Clean cache hourly
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
}, 60 * 60 * 1000);
