import express from 'express';
import cors from 'cors';
import { Low } from 'lowdb';
import { JSONFile } from 'lowdb/node';
import { v4 as uuidv4 } from 'uuid';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3009;

// Middleware
app.use(cors());
app.use(express.json());

// LowDB Setup
const file = path.join(__dirname, 'db.json');
const adapter = new JSONFile(file);
const db = new Low(adapter);

await db.read();
db.data ||= { users: [] };
await db.write();

// Utils
const generateUsername = (walletAddress) => `user_${walletAddress.slice(-8)}`;
const generateReferralCode = () => uuidv4().slice(0, 8).toUpperCase();
const calculateLevel = (referralCount) => {
  if (referralCount >= 100) return 'Legend';
  if (referralCount >= 50) return 'diamond';
  if (referralCount >= 25) return 'gold';
  if (referralCount >= 10) return 'silver';
  return 'bronze';
};

// Create or retrieve user
app.post('/api/user', async (req, res) => {
  const { walletAddress, referredBy } = req.body;
  await db.read();

  let user = db.data.users.find((u) => u.walletAddress === walletAddress);

  if (!user) {
    const username = generateUsername(walletAddress);
    const referralCode = generateReferralCode();

    user = {
      walletAddress,
      username,
      referralCode,
      referredBy: referredBy || null,
      referralCount: 0,
      totalRewards: 0,
      level: 'bronze',
      joinedAt: new Date().toISOString(),
      lastActive: new Date().toISOString(),
      avatarUrl: ''
    };

    db.data.users.push(user);

    if (referredBy) {
      const referrer = db.data.users.find((u) => u.referralCode === referredBy);
      if (referrer) {
        referrer.referralCount += 1;
        referrer.totalRewards += 100;
        referrer.level = calculateLevel(referrer.referralCount);
      }
    }
  } else {
    user.lastActive = new Date().toISOString();
  }

  await db.write();

  res.json({ success: true, user });
});

// Get user
app.get('/api/user/:walletAddress', async (req, res) => {
  await db.read();
  const user = db.data.users.find((u) => u.walletAddress === req.params.walletAddress);
  if (!user) {
    // Auto create user if not found
    const username = generateUsername(req.params.walletAddress);
    const referralCode = generateReferralCode();
    const newUser = {
      walletAddress: req.params.walletAddress,
      username,
      referralCode,
      referredBy: null,
      referralCount: 0,
      totalRewards: 0,
      level: 'bronze',
      joinedAt: new Date().toISOString(),
      lastActive: new Date().toISOString(),
      avatarUrl: ''
    };
    db.data.users.push(newUser);
    await db.write();
    return res.json({ success: true, user: newUser });
  }
  res.json({ success: true, user });
});

// Update user info (username, referralCode, avatar)
app.put('/api/user/:walletAddress', async (req, res) => {
  const { username, referralCode, avatarUrl } = req.body;
  await db.read();

  const user = db.data.users.find((u) => u.walletAddress === req.params.walletAddress);
  if (!user) return res.status(404).json({ success: false, error: 'User not found' });

  if (username) {
    const usernameExists = db.data.users.some((u) => u.username === username && u.walletAddress !== user.walletAddress);
    if (usernameExists) return res.status(400).json({ success: false, error: 'Username already taken' });
    user.username = username;
  }

  if (referralCode) {
    const referralExists = db.data.users.some((u) => u.referralCode === referralCode && u.walletAddress !== user.walletAddress);
    if (referralExists) return res.status(400).json({ success: false, error: 'Referral code already taken' });
    user.referralCode = referralCode;
  }

  if (avatarUrl !== undefined) {
    user.avatarUrl = avatarUrl;
  }

  await db.write();
  res.json({ success: true, user });
});

// Leaderboard
app.get('/api/leaderboard', async (req, res) => {
  await db.read();
  const sorted = [...db.data.users].sort((a, b) => b.referralCount - a.referralCount).slice(0, 10);
  res.json({ success: true, leaderboard: sorted });
});

// Stats
app.get('/api/stats', async (req, res) => {
  await db.read();
  const totalUsers = db.data.users.length;
  const totalReferrals = db.data.users.reduce((acc, u) => acc + u.referralCount, 0);
  res.json({ success: true, stats: { totalUsers, totalReferrals } });
});

// Start server
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
