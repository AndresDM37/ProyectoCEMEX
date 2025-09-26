// // database/snowflake.js
// import snowflake from "snowflake-sdk";

// // Crear conexión
// const connection = snowflake.createConnection({
//   account: "HG45590",
//   username: "SVC_PBI_SCAC_COMMERCIALCDSLOG",
//   password: "yV7q2FD84KtZa7jNDQSAu2z",
//   warehouse: "PRD_TDS_SCAC_COMMERCIAL",
//   database: "PRD_LND_MRP_SAP",
//   schema: "MRP500",
// });

// // Conectar de inmediato al iniciar el servidor
// connection.connect((err, conn) => {
//   if (err) {
//     console.error("❌ Error conectando a Snowflake:", err.message);
//   } else {
//     console.log("✅ Conexión a Snowflake establecida:", conn.getId());
//   }
// });

// export default connection;
