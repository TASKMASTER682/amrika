import mongoose from 'mongoose';

export const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/examos');
    console.log(`MongoDB Connected: ${conn.connection.host}`);

    // Drop the problematic compound index on parallel arrays (if it exists)
    try {
      await conn.connection.db.collection('courses').dropIndex('agencyIds_1_examIds_1');
      console.log('[migration] Dropped old compound index: agencyIds_1_examIds_1');
    } catch (e) {
      // Index might not exist or already dropped - this is expected
      if (e.code !== 27) {
        console.log('[migration] Index cleanup skipped:', e.message);
      }
    }

    // Drop similar problematic indexes on test_series
    try {
      await conn.connection.db.collection('test_series').dropIndex('agencyIds_1_examIds_1');
      console.log('[migration] Dropped old compound index: agencyIds_1_examIds_1 from test_series');
    } catch (e) {
      if (e.code !== 27) {
        console.log('[migration] test_series index cleanup skipped:', e.message);
      }
    }
  } catch (error) {
    console.error(`MongoDB Connection Error: ${error.message}`);
    process.exit(1);
  }
};
