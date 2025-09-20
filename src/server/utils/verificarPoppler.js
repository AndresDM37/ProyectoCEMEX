import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// Función para verificar si Poppler está instalado
export async function verificarPoppler() {
  try {
    const { stdout, stderr } = await execAsync('pdftoppm -v');
    console.log('✅ Poppler está instalado:', stdout.split('\n')[0]);
    return true;
  } catch (error) {
    console.error('❌ Poppler no está instalado o no se encuentra en el PATH');
    console.error('📝 Para instalar:');
    console.error('   Ubuntu/Debian: sudo apt-get install poppler-utils');
    console.error('   macOS: brew install poppler');
    console.error('   Windows: Descargar desde http://blog.alivate.com.au/poppler-windows/');
    return false;
  }
}

// Función para verificar dependencias al iniciar el servidor
export async function verificarDependencias() {
  console.log('🔍 Verificando dependencias...');
  
  const popplerDisponible = await verificarPoppler();
  
  if (!popplerDisponible) {
    console.warn('⚠️ ADVERTENCIA: Los PDFs no podrán procesarse sin Poppler');
    return false;
  }
  
  console.log('✅ Todas las dependencias están disponibles');
  return true;
}