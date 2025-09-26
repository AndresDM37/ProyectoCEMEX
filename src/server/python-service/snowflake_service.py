# snowflake_service.py
from flask import Flask, request, jsonify
from flask_cors import CORS
import snowflake.connector
import os
import logging
from datetime import datetime


# Configurar logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)
CORS(app)  # Permitir CORS para todas las rutas

# Configuración de Snowflake
SNOWFLAKE_CONFIG = {
    'account': 'HG45590.us-west-2',
    'user': 'SVC_PBI_SCAC_COMMERCIALCDSLOG',
    'password': 'yV7q2FD84KtZa7jNDQSAu2z',
    'warehouse': 'PRD_TDS_SCAC_COMMERCIAL',
    'database': 'PRD_LND_MRP_SAP',
    'schema': 'MRP500',
    'insecure_mode': True,  # Para manejar certificados SSL
}

def conectar_snowflake():
    """Crear conexión a Snowflake"""
    try:
        logger.info("🔗 Conectando a Snowflake...")
        
        conn = snowflake.connector.connect(
            account=SNOWFLAKE_CONFIG['account'],
            user=SNOWFLAKE_CONFIG['user'],
            password=SNOWFLAKE_CONFIG['password'],
            warehouse=SNOWFLAKE_CONFIG['warehouse'],
            database=SNOWFLAKE_CONFIG['database'],
            schema=SNOWFLAKE_CONFIG['schema'],
            insecure_mode=SNOWFLAKE_CONFIG['insecure_mode'],
            # Configuración adicional para SSL
            ocsp_response_cache_filename=None,
            validate_default_parameters=False,
            # Timeouts
            network_timeout=60,
            login_timeout=60,
        )
        
        logger.info("✅ Conexión a Snowflake exitosa")
        return conn
        
    except Exception as e:
        logger.error(f"❌ Error conectando a Snowflake: {str(e)}")
        raise

def ejecutar_query(query, params=None):
    """Ejecutar query en Snowflake"""
    conn = None
    cursor = None
    
    try:
        conn = conectar_snowflake()
        cursor = conn.cursor()
        
        logger.info(f"📝 Ejecutando query: {query}")
        logger.info(f"📌 Parámetros: {params}")
        
        if params:
            cursor.execute(query, params)
        else:
            cursor.execute(query)
        
        results = cursor.fetchall()
        columns = [desc[0] for desc in cursor.description]
        
        # Convertir resultados a diccionarios
        data = []
        for row in results:
            row_dict = {}
            for i, value in enumerate(row):
                row_dict[columns[i]] = value
            data.append(row_dict)
        
        logger.info(f"📊 Query exitosa: {len(data)} filas encontradas")
        return data
        
    except Exception as e:
        logger.error(f"❌ Error ejecutando query: {str(e)}")
        raise
    
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()
            logger.info("✅ Conexión Snowflake cerrada")

@app.route('/health', methods=['GET'])
def health_check():
    """Endpoint de health check"""
    try:
        # Probar conexión simple
        conn = conectar_snowflake()
        cursor = conn.cursor()
        cursor.execute("SELECT CURRENT_VERSION()")
        version = cursor.fetchone()[0]
        cursor.close()
        conn.close()
        
        return jsonify({
            'status': 'healthy',
            'timestamp': datetime.now().isoformat(),
            'snowflake_version': version
        })
    except Exception as e:
        return jsonify({
            'status': 'error',
            'error': str(e),
            'timestamp': datetime.now().isoformat()
        }), 500

@app.route('/consultar-cedula', methods=['POST'])
def consultar_cedula():
    """Consultar cédula en tabla KNA1"""
    try:
        data = request.get_json()
        
        if not data or 'cedula' not in data:
            return jsonify({
                'error': 'Parámetro cedula es requerido'
            }), 400
        
        cedula = str(data['cedula']).strip()
        logger.info(f"🔍 Consultando cédula: {cedula}")
        
        # Query optimizada
        query = """
        SELECT 
            STCD1 AS CEDULA
        FROM KNA1 
        WHERE STCD1 = %s 
        LIMIT 10
        """
        
        results = ejecutar_query(query, (cedula,))
        
        response = {
            'existe': len(results) > 0,
            'mensaje': f"✅ La cédula {cedula} existe en SAP" if len(results) > 0 else f"⚠️ La cédula {cedula} no existe en SAP",
            'datos': results[0] if len(results) > 0 else None,
            'total_encontrados': len(results),
            'timestamp': datetime.now().isoformat()
        }
        
        logger.info(f"✅ Consulta completada: {len(results)} registros")
        return jsonify(response)
        
    except Exception as e:
        logger.error(f"❌ Error en consulta: {str(e)}")
        return jsonify({
            'existe': False,
            'mensaje': f"⚠️ Error consultando cédula: {str(e)}",
            'error': str(e),
            'timestamp': datetime.now().isoformat()
        }), 500

@app.route('/query-custom', methods=['POST'])
def query_custom():
    """Ejecutar query personalizada (para testing)"""
    try:
        data = request.get_json()
        
        if not data or 'query' not in data:
            return jsonify({
                'error': 'Parámetro query es requerido'
            }), 400
        
        query = data['query']
        params = data.get('params', None)
        
        logger.info(f"🔧 Ejecutando query personalizada")
        
        results = ejecutar_query(query, params)
        
        return jsonify({
            'success': True,
            'data': results,
            'count': len(results),
            'timestamp': datetime.now().isoformat()
        })
        
    except Exception as e:
        logger.error(f"❌ Error en query personalizada: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e),
            'timestamp': datetime.now().isoformat()
        }), 500

if __name__ == '__main__':
    print("🚀 Iniciando servicio Python Snowflake...")
    print("🔗 Endpoints disponibles:")
    print("   GET  /health - Health check")
    print("   POST /consultar-cedula - Consultar cédula en KNA1")
    print("   POST /query-custom - Query personalizada")
    print("🌐 Servidor corriendo en http://localhost:5001")
    
    app.run(host='0.0.0.0', port=5001, debug=True)