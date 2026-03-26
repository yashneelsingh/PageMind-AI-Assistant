import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';

dotenv.config();

let client: MongoClient | null = null;

export async function getCollection() {
  if (!client) {
    const uri = process.env.MONGO_URI;
    if (!uri) throw new Error("MONGO_URI environment variable is missing!");
    client = new MongoClient(uri);
    await client.connect();
  }
  const db = client.db('AIResearchDB');
  return db.collection('documents');
}
