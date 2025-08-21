import React, { useState } from "react";
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
} from "lucide-react";

function App() {
  const [formulario, setFormulario] = useState({
    sap: "",
    nombreTransportador: "",
    cedula: "",
    nombreConductor: "",
  });
  const [archivo, setArchivo] = useState(null);
  const [archivoEPS, setArchivoEPS] = useState(null);
  const [resultado, setResultado] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showPreview, setShowPreview] = useState(false);

  const handleChange = (e) => {
    setFormulario({ ...formulario, [e.target.name]: e.target.value });
    setError(""); // Limpiar error al cambiar campos
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

      if (archivoEPS) {
        formData.append("certificadoEPS", archivoEPS);
      }

      const res = await axios.post("http://localhost:5000/validar", formData);

      setResultado(res.data);
    } catch (err) {
      setError("Error al procesar la validación. Intenta nuevamente.");
    } finally {
      setLoading(false);
    }
  };

  function formatearCedula(valor) {
    const soloNumeros = valor.replace(/\D/g, "");
    return soloNumeros.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  }

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    setArchivo(file);
    setError("");
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
            <img src="/public/images/Cemex_logo_2023.png" alt="logo" />
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
                    name="sap"
                    value={formulario.sap}
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
                  Documento de Identidad *
                </label>
                <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-blue-400 transition-colors">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleFileChange}
                    className="hidden"
                    id="file-upload"
                    required
                  />
                  <label htmlFor="file-upload" className="cursor-pointer">
                    <Upload className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                    <p className="text-sm text-gray-600">
                      {archivo
                        ? archivo.name
                        : "Haz clic para subir una imagen"}
                    </p>
                    <p className="text-xs text-gray-400 mt-1">
                      PNG, JPG hasta 10MB
                    </p>
                  </label>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Certificado EPS *
                </label>
                <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-blue-400 transition-colors">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      setArchivoEPS(e.target.files[0]);
                      setError("");
                    }}
                    className="hidden"
                    id="eps-upload"
                  />
                  <label htmlFor="eps-upload" className="cursor-pointer">
                    <Upload className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                    <p className="text-sm text-gray-600">
                      {archivoEPS
                        ? archivoEPS.name
                        : "Haz clic para subir certificado EPS"}
                    </p>
                    <p className="text-xs text-gray-400 mt-1">
                      PNG, JPG hasta 10MB
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
                  isValid={resultado.edadValida}
                  label={`Edad ${resultado.edadValida ? "válida" : "inválida"}`}
                />

                {resultado.documentoEPS && (
                  <div className="mt-6">
                    <h3 className="text-lg font-medium text-gray-800 mb-2">
                      Certificado EPS
                    </h3>
                    <StatusIcon
                      isValid={resultado.documentoEPS.nombreEncontrado}
                      label="Nombre encontrado en EPS"
                    />
                    <StatusIcon
                      isValid={resultado.documentoEPS.cedulaEncontrada}
                      label="Cédula encontrada en EPS"
                    />
                    <StatusIcon
                      isValid={resultado.documentoEPS.fechaValida}
                      label={
                        resultado.documentoEPS.fechaValida
                          ? "Fecha válida (menos de 30 días)"
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

                {resultado.documentoEPS && (
                  <div className="mt-6">
                    <h3 className="text-lg font-medium text-gray-800 mb-2">
                      Certificado EPS
                    </h3>
                    <StatusIcon
                      isValid={resultado.documentoEPS.nombreEncontrado}
                      label="Nombre encontrado en EPS"
                    />
                    <StatusIcon
                      isValid={resultado.documentoEPS.cedulaEncontrada}
                      label="Cédula encontrada en EPS"
                    />
                    <StatusIcon
                      isValid={resultado.documentoEPS.fechaValida}
                      label={
                        resultado.documentoEPS.fechaValida
                          ? "Fecha válida (menos de 30 días)"
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

                {resultado.texto && (
                  <div className="mt-6">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-lg font-medium text-gray-800">
                        Texto Extraído
                      </h3>
                      <button
                        onClick={() => setShowPreview(!showPreview)}
                        className="flex items-center text-blue-600 hover:text-blue-700 text-sm"
                      >
                        <Eye className="w-4 h-4 mr-1" />
                        {showPreview ? "Ocultar" : "Ver detalles"}
                      </button>
                    </div>

                    {showPreview && (
                      <div className="bg-gray-50 rounded-lg p-4 max-h-64 overflow-y-auto">
                        <pre className="text-sm text-gray-700 whitespace-pre-wrap font-mono">
                          {resultado.texto}
                        </pre>
                      </div>
                    )}
                  </div>
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
