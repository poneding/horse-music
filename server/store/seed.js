const seed = {
  tracks: [
    { id: 'seed-1', title: '雨后慢行', artist: '林岚', album: '夜色公路', genre: '华语流行', duration: 0, coverUrl: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?auto=format&fit=crop&w=720&q=85', src: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3', lyrics: '[00:00.00] 街灯慢慢亮起来\n[00:10.00] 雨水把城市洗成了新的模样\n[00:20.00] 我们沿着熟悉的路，走向远方' },
    { id: 'seed-2', title: '在风经过的地方', artist: '周与海', album: '沿岸', genre: '独立民谣', duration: 0, coverUrl: 'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=720&q=85', src: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3', lyrics: '[00:00.00] 风从海面吹来\n[00:12.00] 把没说完的话带向远方\n[00:24.00] 我在风经过的地方等你' },
    { id: 'seed-3', title: '凌晨两点的蓝', artist: 'Mori', album: '夜色公路', genre: '电子', duration: 0, coverUrl: 'https://images.unsplash.com/photo-1519608487953-e999c86e7455?auto=format&fit=crop&w=720&q=85', src: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3', lyrics: '[00:00.00] 夜色落在窗边\n[00:14.00] 一座城市进入安静\n[00:28.00] 只剩心跳和微弱的蓝' },
    { id: 'seed-4', title: '把日子唱成歌', artist: '许安然', album: '晴天清单', genre: '轻爵士', duration: 0, coverUrl: 'https://images.unsplash.com/photo-1516280440614-37939bbacd81?auto=format&fit=crop&w=720&q=85', src: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3', lyrics: '[00:00.00] 早餐的咖啡还冒着热气\n[00:11.00] 今天也有新的好天气\n[00:22.00] 把平凡的日子唱成歌' },
    { id: 'seed-5', title: '海风写给你', artist: '白屿', album: '沿岸', genre: '独立民谣', duration: 0, coverUrl: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=720&q=85', src: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-5.mp3', lyrics: '[00:00.00] 海风写下你的名字\n[00:13.00] 潮汐又把它轻轻擦去\n[00:26.00] 我仍然记得那片蓝' },
    { id: 'seed-6', title: '失重派对', artist: 'Neon Field', album: '微光俱乐部', genre: '电子', duration: 0, coverUrl: 'https://images.unsplash.com/photo-1506157786151-b8491531f063?auto=format&fit=crop&w=720&q=85', src: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-6.mp3', lyrics: '[00:00.00] 灯光亮起，世界失重\n[00:15.00] 跟着节拍穿过人群\n[00:30.00] 今晚我们不必着陆' }
  ],
  albums: [
    { id: 'album-1', title: '夜色公路', artist: '林岚 / Mori', description: '写给每一个晚归的人。', coverUrl: 'https://images.unsplash.com/photo-1519608487953-e999c86e7455?auto=format&fit=crop&w=900&q=88' },
    { id: 'album-2', title: '沿岸', artist: '周与海 / 白屿', description: '沿着海岸线，把故事唱给风听。', coverUrl: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=900&q=88' },
    { id: 'album-3', title: '晴天清单', artist: '许安然', description: '给普通日子的一点明亮。', coverUrl: 'https://images.unsplash.com/photo-1516280440614-37939bbacd81?auto=format&fit=crop&w=900&q=88' },
    { id: 'album-4', title: '微光俱乐部', artist: 'Neon Field', description: '夜晚的另一种打开方式。', coverUrl: 'https://images.unsplash.com/photo-1506157786151-b8491531f063?auto=format&fit=crop&w=900&q=88' }
  ],
  artists: [],
  recentPlays: [],
  playlists: [
    { id: 'playlist-1', title: '慢一点也没关系', description: '给需要喘口气的下午', coverUrl: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?auto=format&fit=crop&w=900&q=88', trackIds: ['seed-1', 'seed-2', 'seed-5'] },
    { id: 'playlist-2', title: '窗外的夜', description: '适合一个人听的深夜歌单', coverUrl: 'https://images.unsplash.com/photo-1519608487953-e999c86e7455?auto=format&fit=crop&w=900&q=88', trackIds: ['seed-3', 'seed-1', 'seed-6'] },
    { id: 'playlist-3', title: '今天是晴天', description: '让好心情多停留一会儿', coverUrl: 'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=900&q=88', trackIds: ['seed-4', 'seed-2', 'seed-5'] }
  ]
};

module.exports = seed;
