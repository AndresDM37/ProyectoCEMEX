import { useState } from "react";
import axios from "axios";

import {
  Upload,
  FileText,
  CheckCircle,
  XCircle,
  User,
  CreditCard,
  Truck,
  Eye,
  Image as ImageIcon, // CAMBIO: Renombrar Image como ImageIcon
} from "lucide-react";

function App() {
  const [formulario, setFormulario] = useState({
    sap: "",
    nombreTransportador: "",
    cedula: "",
    nombreConductor: "",
  });
  const [archivoFormato, setArchivoFormato] = useState(null);
  const [archivo, setArchivo] = useState(null);
  const [archivoLicencia, setArchivoLicencia] = useState(null);
  const [archivoEPS, setArchivoEPS] = useState(null);
  const [archivoARL, setArchivoARL] = useState(null);
  const [archivoPension, setArchivoPension] = useState(null);
  const [resultado, setResultado] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showPreview, setShowPreview] = useState(false);

  const handleChange = (e) => {
    setFormulario({ ...formulario, [e.target.name]: e.target.value });
    setError(""); // Limpiar error al cambiar campos
  };

  // Función para validar archivos
  const validarArchivo = (file) => {
    const tiposPermitidos = [
      "image/jpeg",
      "image/jpg",
      "image/png",
      "application/pdf",
    ];

    const tamañoMaximo = 10 * 1024 * 1024; // 10MB

    if (!tiposPermitidos.includes(file.type)) {
      throw new Error(
        "Tipo de archivo no permitido. Solo se aceptan JPG, PNG y PDF."
      );
    }

    if (file.size > tamañoMaximo) {
      throw new Error("El archivo es demasiado grande. Máximo 10MB.");
    }

    return true;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (!archivo) {
      setError("Por favor, sube un documento para validar");
      return;
    }

    if (!formulario.cedula || !formulario.nombreConductor) {
      setError("Por favor, completa todos los campos obligatorios");
      return;
    }

    setLoading(true);

    try {
      const formData = new FormData();
      for (const key in formulario) {
        const value =
          key === "cedula"
            ? formulario[key].replace(/\./g, "")
            : formulario[key];
        formData.append(key, value);
      }
      formData.append("documento", archivo);

      if (archivoFormato) {
        formData.append("formatoCreacion", archivoFormato);
      }

      if (archivoLicencia) {
        formData.append("licenciaConduccion", archivoLicencia);
      }

      if (archivoEPS) {
        formData.append("certificadoEPS", archivoEPS);
      }

      if (archivoARL) {
        formData.append("certificadoARL", archivoARL);
      }

      if (archivoPension) {
        formData.append("certificadoPension", archivoPension);
      }

      const res = await axios.post("http://localhost:5000/validar", formData);

      setResultado(res.data);
    } catch (err) {
      console.error("Error en validación:", err);
      setError(
        err.response?.data?.error ||
          "Error al procesar la validación. Intenta nuevamente."
      );
    } finally {
      setLoading(false);
    }
  };

  function formatearCedula(valor) {
    const soloNumeros = valor.replace(/\D/g, "");
    return soloNumeros.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  }

  // Función para manejar el cambio de archivo
  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      try {
        validarArchivo(file);
        setArchivo(file);
        // Limpiar cualquier error previo
        setError("");
      } catch (error) {
        setError(error.message);
        e.target.value = ""; // Limpiar el input
        setArchivo(null);
      }
    }
  };

  // FUNCIÓN CORREGIDA: Usar ImageIcon en lugar de Image
  const obtenerIconoArchivo = (archivo) => {
    if (!archivo)
      return <Upload className="w-8 h-8 text-gray-400 mx-auto mb-2" />;

    if (archivo.type === "application/pdf") {
      return <FileText className="w-8 h-8 text-red-500 mx-auto mb-2" />;
    } else {
      return <ImageIcon className="w-8 h-8 text-blue-500 mx-auto mb-2" />;
    }
  };

  // Agregar esta función en tu componente App
  const limpiarFormulario = () => {
    // Limpiar estados del formulario
    setFormulario({
      codigoTransportador: "",
      nombreTransportador: "",
      cedula: "",
      nombreConductor: "",
    });

    // Limpiar archivos
    setArchivoFormato(null);
    setArchivo(null);
    setArchivoLicencia(null);
    setArchivoEPS(null);
    setArchivoARL(null);
    setArchivoPension(null);

    // Limpiar resultados y errores
    setResultado(null);
    setError("");
    setLoading(false);

    // Limpiar inputs de archivos del DOM
    const fileInputs = document.querySelectorAll('input[type="file"]');
    fileInputs.forEach((input) => (input.value = ""));
  };
  const StatusIcon = ({ isValid, label }) => (
    <div
      className={`flex items-center space-x-2 p-3 rounded-lg ${
        isValid ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"
      }`}
    >
      {isValid ? (
        <CheckCircle className="w-5 h-5" />
      ) : (
        <XCircle className="w-5 h-5" />
      )}
      <span className="font-medium">{label}</span>
    </div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-50 h-16">
            <img src="/images/Cemex_logo_2023.png" alt="logo" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Sistema de Validación de Documentos
          </h1>
          <p className="text-gray-600">
            Valida documentos de conductores de forma automática
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Formulario */}
          <div className="bg-white rounded-xl shadow-lg p-6">
            <h2 className="text-xl font-semibold text-gray-800 mb-6 flex items-center">
              <User className="w-5 h-5 mr-2 text-blue-600" />
              Información del Conductor
            </h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Código SAP
                </label>
                <div className="relative">
                  <Truck className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
                  <input
                    name="codigoTransportador"
                    value={formulario.codigoTransportador}
                    onChange={handleChange}
                    placeholder="Ingresa el código SAP"
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Nombre del Transportador
                </label>
                <input
                  name="nombreTransportador"
                  value={formulario.nombreTransportador}
                  onChange={handleChange}
                  placeholder="Nombre de la empresa transportadora"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Cédula del Conductor *
                </label>
                <div className="relative">
                  <CreditCard className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
                  <input
                    name="cedula"
                    value={formulario.cedula}
                    onChange={(e) => {
                      const sinPuntos = e.target.value.replace(/\D/g, "");
                      setFormulario({
                        ...formulario,
                        cedula: formatearCedula(sinPuntos),
                      });
                      setError("");
                    }}
                    placeholder="12.345.678"
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Nombre del Conductor *
                </label>
                <input
                  name="nombreConductor"
                  value={formulario.nombreConductor}
                  onChange={handleChange}
                  placeholder="Nombre completo del conductor"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Formato de Creación *
                </label>
                <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-blue-400 transition-colors">
                  <input
                    type="file"
                    accept="image/*,.pdf"
                    onChange={(e) => {
                      const file = e.target.files[0];
                      if (file) {
                        try {
                          validarArchivo(file);
                          setArchivoFormato(file);
                          setError("");
                        } catch (error) {
                          setError(error.message);
                          e.target.value = "";
                          setArchivoFormato(null);
                        }
                      }
                    }}
                    className="hidden"
                    id="formato-upload"
                  />
                  <label htmlFor="formato-upload" className="cursor-pointer">
                    {!archivoFormato ? (
                      <Upload className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                    ) : archivoFormato.type === "application/pdf" ? (
                      <FileText className="w-8 h-8 text-red-500 mx-auto mb-2" />
                    ) : (
                      <ImageIcon className="w-8 h-8 text-blue-500 mx-auto mb-2" />
                    )}
                    <p className="text-sm text-gray-600">
                      {archivoFormato
                        ? `${archivoFormato.name} (${(
                            archivoFormato.size /
                            1024 /
                            1024
                          ).toFixed(2)} MB)`
                        : "Haz clic para subir formato de creación"}
                    </p>
                    <p className="text-xs text-gray-400 mt-1">
                      PNG, JPG, PDF hasta 10MB
                    </p>
                  </label>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Documento de Identidad *
                </label>
                <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-blue-400 transition-colors">
                  <input
                    type="file"
                    accept="image/*,.pdf"
                    onChange={handleFileChange}
                    className="hidden"
                    id="file-upload"
                    required
                  />
                  <label htmlFor="file-upload" className="cursor-pointer">
                    {obtenerIconoArchivo(archivo)}
                    <p className="text-sm text-gray-600">
                      {archivo
                        ? `${archivo.name} (${(
                            archivo.size /
                            1024 /
                            1024
                          ).toFixed(2)} MB)`
                        : "Haz clic para subir un archivo"}
                    </p>
                    <p className="text-xs text-gray-400 mt-1">
                      PNG, JPG, PDF hasta 10MB
                    </p>
                  </label>
                </div>
                {error && <p className="text-red-500 text-xs mt-2">{error}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Certificado EPS *
                </label>
                <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-blue-400 transition-colors">
                  <input
                    type="file"
                    accept="image/*,.pdf"
                    onChange={(e) => {
                      const file = e.target.files[0];
                      if (file) {
                        try {
                          validarArchivo(file);
                          setArchivoEPS(file);
                          setError("");
                        } catch (error) {
                          setError(error.message);
                          e.target.value = "";
                          setArchivoEPS(null);
                        }
                      }
                    }}
                    className="hidden"
                    id="eps-upload"
                  />
                  <label htmlFor="eps-upload" className="cursor-pointer">
                    {!archivoEPS ? (
                      <Upload className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                    ) : archivoEPS.type === "application/pdf" ? (
                      <FileText className="w-8 h-8 text-red-500 mx-auto mb-2" />
                    ) : (
                      <ImageIcon className="w-8 h-8 text-blue-500 mx-auto mb-2" />
                    )}
                    <p className="text-sm text-gray-600">
                      {archivoEPS
                        ? `${archivoEPS.name} (${(
                            archivoEPS.size /
                            1024 /
                            1024
                          ).toFixed(2)} MB)`
                        : "Haz clic para subir certificado EPS"}
                    </p>
                    <p className="text-xs text-gray-400 mt-1">
                      PNG, JPG, PDF hasta 10MB
                    </p>
                  </label>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Certificado ARL *
                </label>
                <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-blue-400 transition-colors">
                  <input
                    type="file"
                    accept="image/*,.pdf"
                    onChange={(e) => {
                      const file = e.target.files[0];
                      if (file) {
                        try {
                          validarArchivo(file);
                          setArchivoARL(file);
                          setError("");
                        } catch (error) {
                          setError(error.message);
                          e.target.value = "";
                          setArchivoARL(null);
                        }
                      }
                    }}
                    className="hidden"
                    id="arl-upload"
                  />
                  <label htmlFor="arl-upload" className="cursor-pointer">
                    {!archivoARL ? (
                      <Upload className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                    ) : archivoARL.type === "application/pdf" ? (
                      <FileText className="w-8 h-8 text-red-500 mx-auto mb-2" />
                    ) : (
                      <ImageIcon className="w-8 h-8 text-blue-500 mx-auto mb-2" />
                    )}
                    <p className="text-sm text-gray-600">
                      {archivoARL
                        ? `${archivoARL.name} (${(
                            archivoARL.size /
                            1024 /
                            1024
                          ).toFixed(2)} MB)`
                        : "Haz clic para subir certificado ARL"}
                    </p>
                    <p className="text-xs text-gray-400 mt-1">
                      PNG, JPG, PDF hasta 10MB
                    </p>
                  </label>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Certificado Pensión *
                </label>
                <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-blue-400 transition-colors">
                  <input
                    type="file"
                    accept="image/*,.pdf"
                    onChange={(e) => {
                      const file = e.target.files[0];
                      if (file) {
                        try {
                          validarArchivo(file);
                          setArchivoPension(file);
                          setError("");
                        } catch (error) {
                          setError(error.message);
                          e.target.value = "";
                          setArchivoPension(null);
                        }
                      }
                    }}
                    className="hidden"
                    id="pension-upload"
                  />
                  <label htmlFor="pension-upload" className="cursor-pointer">
                    {!archivoPension ? (
                      <Upload className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                    ) : archivoPension.type === "application/pdf" ? (
                      <FileText className="w-8 h-8 text-red-500 mx-auto mb-2" />
                    ) : (
                      <ImageIcon className="w-8 h-8 text-blue-500 mx-auto mb-2" />
                    )}
                    <p className="text-sm text-gray-600">
                      {archivoPension
                        ? `${archivoPension.name} (${(
                            archivoPension.size /
                            1024 /
                            1024
                          ).toFixed(2)} MB)`
                        : "Haz clic para subir certificado PENSION"}
                    </p>
                    <p className="text-xs text-gray-400 mt-1">
                      PNG, JPG, PDF hasta 10MB
                    </p>
                  </label>
                </div>
              </div>

              {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                  <p className="text-red-700 text-sm">{error}</p>
                </div>
              )}

              <button
                onClick={handleSubmit}
                disabled={loading}
                className="w-full bg-blue-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
              >
                {loading ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent mr-2"></div>
                    Validando...
                  </>
                ) : (
                  "Validar Documento"
                )}
              </button>
            </div>
          </div>

          {/* Resultados */}
          <div className="bg-white rounded-xl shadow-lg p-6">
            <h2 className="text-xl font-semibold text-gray-800 mb-6 flex items-center">
              <CheckCircle className="w-5 h-5 mr-2 text-green-600" />
              Resultados de Validación
            </h2>

            {resultado?.validacionBD && (
              <div className="bg-blue-50 border border-blue-200 text-blue-800 rounded-lg p-4 mb-4">
                <p className="font-medium">{resultado.validacionBD.mensaje}</p>
              </div>
            )}

            {!resultado ? (
              <div className="text-center py-12">
                <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <FileText className="w-8 h-8 text-gray-400" />
                </div>
                <p className="text-gray-500">
                  Los resultados aparecerán aquí después de la validación
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                <h3 className="text-lg font-medium text-gray-800 mb-2">
                  Cedula
                </h3>
                <StatusIcon
                  isValid={resultado.coincidencias.cedula}
                  label={`Cédula ${
                    resultado.coincidencias.cedula
                      ? "encontrada"
                      : "no coincide"
                  }`}
                />

                <StatusIcon
                  isValid={resultado.coincidencias.nombre}
                  label={`Nombre ${
                    resultado.coincidencias.nombre
                      ? "encontrado"
                      : "no coincide"
                  }`}
                />

                <StatusIcon
                  isValid={true}
                  label={`Edad ${
                    resultado.coincidencias.edadValida ? "válida" : "no valida"
                  }`}
                />

                {resultado.documentoFormato && (
                  <div className="mt-6">
                    <h3 className="text-lg font-medium text-gray-800 mb-2">
                      Formato de Creación
                    </h3>
                    <StatusIcon
                      isValid={
                        resultado.documentoFormato.codigoTransportador.coincide
                      }
                      label={`Código Transportador ${
                        resultado.documentoFormato.codigoTransportador.coincide
                          ? "coincide"
                          : "no coincide"
                      }`}
                    />

                    <StatusIcon
                      isValid={
                        resultado.documentoFormato.transportador.coincide
                      }
                      label={`Nombre Transportador ${
                        resultado.documentoFormato.transportador.coincide
                          ? "encontrado"
                          : "no coincide"
                      }`}
                    />

                    <StatusIcon
                      isValid={
                        resultado.documentoFormato.conductor.cedula.coincide
                      }
                      label={`Cédula Conductor ${
                        resultado.documentoFormato.conductor.cedula.coincide
                          ? "encontrada"
                          : "no coincide"
                      }`}
                    />

                    <StatusIcon
                      isValid={
                        resultado.documentoFormato.conductor.nombre.coincide
                      }
                      label={`Nombre Conductor ${
                        resultado.documentoFormato.conductor.nombre.coincide
                          ? "encontrado"
                          : "no coincide"
                      }`}
                    />
                  </div>
                )}

                {resultado.documentoEPS && (
                  <div className="mt-6">
                    <h3 className="text-lg font-medium text-gray-800 mb-2">
                      Certificado EPS
                    </h3>

                    <StatusIcon
                      isValid={resultado.documentoEPS.nombreEncontrado}
                      label={
                        resultado.documentoEPS.nombreEncontrado
                          ? "Nombre coincide con el certificado"
                          : "Nombre no encontrado"
                      }
                    />

                    <StatusIcon
                      isValid={resultado.documentoEPS.cedulaEncontrada}
                      label={
                        resultado.documentoEPS.cedulaEncontrada
                          ? "Cédula encontrada en EPS"
                          : "Cédula no coincide"
                      }
                    />

                    <StatusIcon
                      isValid={resultado.documentoEPS.fechaValida}
                      label={
                        resultado.documentoEPS.fechaValida
                          ? `Fecha válida (emitido hace ${resultado.documentoEPS.diffDias} días)`
                          : "Documento vencido (más de 30 días)"
                      }
                    />

                    <div className="space-y-2 mt-2">
                      {Object.entries(resultado.documentoEPS.palabrasClave).map(
                        ([clave, valor]) => (
                          <StatusIcon
                            key={clave}
                            isValid={valor}
                            label={`Contiene "${clave}"`}
                          />
                        )
                      )}
                    </div>
                  </div>
                )}

                {resultado.documentoARL && (
                  <div className="mt-6">
                    <h3 className="text-lg font-medium text-gray-800 mb-2">
                      Certificado ARL
                    </h3>
                    <StatusIcon
                      isValid={resultado.documentoARL.nombreEncontrado}
                      label="Nombre encontrado en ARL"
                    />
                    <StatusIcon
                      isValid={resultado.documentoARL.cedulaEncontrada}
                      label="Cédula encontrada en ARL"
                    />
                    <StatusIcon
                      isValid={resultado.documentoARL.cumpleRiesgo}
                      label={
                        resultado.documentoARL.cumpleRiesgo
                          ? `Clase de riesgo válida (≥ 4) - Clase ${resultado.documentoARL.riesgoEncontrado}`
                          : `Clase de riesgo no cumple (menor a 4) - Clase ${
                              resultado.documentoARL.riesgoEncontrado ||
                              "No encontrada"
                            }`
                      }
                    />
                    <StatusIcon
                      isValid={resultado.documentoARL.fechaValida}
                      label={
                        resultado.documentoARL.fechaValida
                          ? `Fecha válida (emitido hace ${resultado.documentoARL.diffDias} días)`
                          : "Documento vencido (más de 30 días)"
                      }
                    />
                    <div className="space-y-2 mt-2">
                      {Object.entries(resultado.documentoARL.palabrasClave).map(
                        ([clave, valor]) => (
                          <StatusIcon
                            key={clave}
                            isValid={valor}
                            label={`Contiene "${clave}"`}
                          />
                        )
                      )}
                    </div>
                  </div>
                )}

                {resultado.documentoPension && (
                  <div className="mt-6">
                    <h3 className="text-lg font-medium text-gray-800 mb-2">
                      Certificado Pensión
                    </h3>
                    <StatusIcon
                      isValid={resultado.documentoPension.nombreEncontrado}
                      label="Nombre encontrado en Pensión"
                    />
                    <StatusIcon
                      isValid={resultado.documentoPension.cedulaEncontrada}
                      label="Cédula encontrada en Pensión"
                    />
                    <StatusIcon
                      isValid={resultado.documentoPension.fechaValida}
                      label={
                        resultado.documentoPension.fechaValida
                          ? `Fecha válida (emitido hace ${resultado.documentoPension.diffDias} días)`
                          : "Documento vencido (más de 30 días)"
                      }
                    />
                    <div className="space-y-2 mt-2">
                      {Object.entries(
                        resultado.documentoPension.palabrasClave
                      ).map(([clave, valor]) => (
                        <StatusIcon
                          key={clave}
                          isValid={valor}
                          label={`Contiene "${clave}"`}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {resultado && (
                  <button
                    onClick={limpiarFormulario}
                    className="w-full bg-green-600 text-white py-2 px-4 rounded-lg font-medium hover:bg-green-700 transition-all mt-4"
                  >
                    Revisar Nuevo Conductor
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
