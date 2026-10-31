const { MongoClient } = require('mongodb');

async function migrateData() {
    const localUri = 'mongodb://localhost:27017';
    const atlasUri = 'mongodb+srv://reuse_admin:Reuse123@web88.pttnnbl.mongodb.net/reuse_hub?retryWrites=true&w=majority';

    const localClient = new MongoClient(localUri);
    const atlasClient = new MongoClient(atlasUri);

    try {
        console.log('Đang kết nối tới Local và Atlas...');
        await localClient.connect();
        await atlasClient.connect();

        const localDb = localClient.db('reuse_hub');
        const atlasDb = atlasClient.db('reuse_hub');

        const collections = await localDb.listCollections().toArray();

        for (let col of collections) {
            const colName = col.name;
            const data = await localDb.collection(colName).find({}).toArray();
            
            if (data.length > 0) {
                // Xóa dữ liệu cũ trên Atlas (nếu có) và insert dữ liệu từ local sang
                await atlasDb.collection(colName).deleteMany({});
                await atlasDb.collection(colName).insertMany(data);
                console.log(`✅ Đã đồng bộ xong [${colName}]: ${data.length} bản ghi.`);
            } else {
                console.log(`⚠️ Collection [${colName}] ở local đang trống, bỏ qua.`);
            }
        }
        console.log('🎉 Đã đẩy toàn bộ dữ liệu từ Local lên Atlas thành công xuất sắc!');
    } catch (error) {
        console.error('❌ Lỗi khi migrate:', error);
    } finally {
        await localClient.close();
        await atlasClient.close();
    }
}

migrateData();