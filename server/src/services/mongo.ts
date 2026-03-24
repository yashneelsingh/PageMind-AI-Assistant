import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';

dotenv.config();

const uri = process.env.MONGO_URI || '';
const client = new MongoClient(uri);

export async function getCollection() {
  await client.connect();
  const db = client.db('AIResearchDB');
  return db.collection('documents');
}
