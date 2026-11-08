'use client';
import React, { useState, useEffect, useRef } from 'react';
import { Button } from 'primereact/button';
import { Card } from 'primereact/card';
import { InputText } from 'primereact/inputtext';
import { Calendar } from 'primereact/calendar';
import { Toast } from 'primereact/toast';
import { Toolbar } from 'primereact/toolbar';
import { DataTable } from 'primereact/datatable';
import { Column } from 'primereact/column';
import { Dialog } from 'primereact/dialog';
import { Dropdown } from 'primereact/dropdown';
import { fetchOperadores, Operador as Empleado } from '../../../../../Services/BD/operadoresService';
import { fetchPrestamosActivos, Prestamo, aplicarPagoPrestamo } from '../../../../../Services/BD/Nomina/prestamosService';
import { fetchViajes, Viaje } from '../../../../../Services/BD/viajeService';
import { createNomina, Nomina, updateNomina, fetchNominasPorSemana } from '../../../../../Services/BD/Nomina/nominasService';
import { fetchBonosActivos } from '../../../../../Services/BD/Nomina/bonosService';
import * as XLSX from 'xlsx';
import { useCallback } from 'react';
import { ReciboNominaPrint } from './recibo/ReciboNominaPrint';
import { ModalVistaPrevia } from './recibo/ModalVistaPrevia';
import { Checkbox } from 'primereact/checkbox';
import { InputNumber } from 'primereact/inputnumber';
import { fetchClientes } from '../../../../../Services/BD/clientesService';
import { fetchDescuentos } from '../../../../../Services/BD/Nomina/descuentoService';
import { Descuento } from '../../../../../Services/BD/Nomina/descuentoService';
import { fetchNominaConfiguracion, saveNominaConfiguracion, NominaConfiguracion, NOMINA_CONFIG_DEFAULT } from '../../../../../Services/BD/Nomina/nominaConfiguracionService';

const NominaModule = () => {
    const [empleados, setEmpleados] = useState<Empleado[]>([]);
    const [prestamos, setPrestamos] = useState<Prestamo[]>([]);
    const [viajes, setViajes] = useState<Viaje[]>([]);
    const [fechaSeleccionada, setFechaSeleccionada] = useState<Date>(new Date());
    const [nominasCalculadas, setNominasCalculadas] = useState<any[]>([]);
    const [viajesSemana, setViajesSemana] = useState<Viaje[]>([]);
    const [cargando, setCargando] = useState(false);
    const [verificando, setVerificando] = useState(false);
    const [showResults, setShowResults] = useState(false);
    const [showPagoDialog, setShowPagoDialog] = useState(false);
    const [nominaSeleccionada, setNominaSeleccionada] = useState<any>(null);
    const [metodoPago, setMetodoPago] = useState('');
    const [referenciaPago, setReferenciaPago] = useState('');
    const [nominaGuardada, setNominaGuardada] = useState(false);
    const [semanaActual, setSemanaActual] = useState<number>(0);
    const [anioActual, setAnioActual] = useState<number>(0);
    const toast = useRef<Toast>(null);
    const dt = useRef<DataTable<any>>(null);
    const [showVistaPrevia, setShowVistaPrevia] = useState(false);
    const [nominaParaVistaPrevia, setNominaParaVistaPrevia] = useState<any>(null);
    const [clientes, setClientes] = useState<any[]>([]);
    const [filtroBusqueda, setFiltroBusqueda] = useState('');

    // Prestamo
    const [showPrestamoDialog, setShowPrestamoDialog] = useState(false);
    const [prestamoSeleccionado, setPrestamoSeleccionado] = useState<any>(null);
    const [montoDescuento, setMontoDescuento] = useState(0);
    const [aplicarDescuento, setAplicarDescuento] = useState(false);

    // Configuración de meta / porcentajes (editable por el admin)
    const [configNomina, setConfigNomina] = useState<NominaConfiguracion>({ ...NOMINA_CONFIG_DEFAULT });
    const [guardandoConfig, setGuardandoConfig] = useState(false);

    const metodosPago = [
        { label: 'Efectivo', value: 'efectivo' },
        { label: 'Transferencia', value: 'transferencia' },
        { label: 'Cheque', value: 'cheque' },
        { label: 'Depósito', value: 'deposito' }
    ];

    const exportCSV = () => {
        dt.current?.exportCSV();
    };


    useEffect(() => {
        cargarDatos();
    }, []);

    useEffect(() => {
        verificarNominaExistente();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [fechaSeleccionada]);

    // ************************************** FUNCIONES PARA CAMBIAR LA FECHA DE RANGO DE NOMINA *************************************
    // Semana fija: Viernes -> Jueves
    const getStartOfFixedWeek = (date: Date, startDay: number = 5) => {
        const d = new Date(date);
        const day = d.getDay();

        // Retrocede hasta el viernes correspondiente
        const diff = (day - startDay + 7) % 7;

        d.setDate(d.getDate() - diff);
        d.setHours(0, 0, 0, 0);

        return d;
    };

    const getEndOfFixedWeek = (date: Date, startDay: number = 5) => {
        const start = getStartOfFixedWeek(date, startDay);

        const end = new Date(start);
        end.setDate(end.getDate() + 6); // Viernes + 6 = Jueves
        end.setHours(23, 59, 59, 999);

        return end;
    };

    // ******************************************************************************************************************************
    const getWeekNumber = (date: Date) => {
        const startOfWeek = getStartOfFixedWeek(date, 5); // Viernes

        const year = startOfWeek.getFullYear();
        const firstDay = new Date(year, 0, 1);

        // Buscar el primer viernes del año
        const diffToFirstFriday = (5 - firstDay.getDay() + 7) % 7;

        const firstFriday = new Date(firstDay);
        firstFriday.setDate(firstFriday.getDate() + diffToFirstFriday);
        firstFriday.setHours(0, 0, 0, 0);

        const diffMs = startOfWeek.getTime() - firstFriday.getTime();

        return Math.floor(diffMs / (7 * 24 * 60 * 60 * 1000)) + 1;
    };


    const formatDate = (date: Date) => {
        return date.toISOString().split('T')[0];
    };

    const formatDateDisplay = (date: Date) => {
        return date.toLocaleDateString('es-ES', {
            day: '2-digit',
            month: 'short',
            year: 'numeric'
        });
    };

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('es-MX', {
            style: 'currency',
            currency: 'MXN'
        }).format(amount);
    };

    const calcularTotalViajesSemana = (viajes: any[]) => {
        return viajes.reduce((sum, viaje) => {
            return sum + (viaje.caphrsviajes || 0);
        }, 0);
    };

    const goToPreviousWeek = () => {
        const newDate = new Date(fechaSeleccionada);
        newDate.setDate(newDate.getDate() - 7);
        setFechaSeleccionada(newDate);
        setShowResults(false);
        setNominaGuardada(false);
    };

    const goToNextWeek = () => {
        const newDate = new Date(fechaSeleccionada);
        newDate.setDate(newDate.getDate() + 7);
        setFechaSeleccionada(newDate);
        setShowResults(false);
        setNominaGuardada(false);
    };

    const cerrarResultados = () => {
        setShowResults(false);
        setNominasCalculadas([]);
        setViajesSemana([]);
        setFiltroBusqueda('');
    };

    // Crear una variable con los datos filtrados
    const datosFiltrados = React.useMemo(() => {
        if (!filtroBusqueda) return nominasCalculadas;
        
        return nominasCalculadas.filter(nomina => 
            nomina.empleado_nombre?.toLowerCase().includes(filtroBusqueda.toLowerCase()) ||
            nomina.id_operador?.toString().includes(filtroBusqueda) ||
            nomina.estatus?.toLowerCase().includes(filtroBusqueda.toLowerCase())
        );
    }, [nominasCalculadas, filtroBusqueda]);

    // Filtro para los viajes basado en el operador seleccionado
    const viajesFiltrados = React.useMemo(() => {
        if (!filtroBusqueda) return viajesSemana;
        
        // Obtener los nombres de los operadores que coinciden con la búsqueda
        const operadoresFiltrados = nominasCalculadas
            .filter(nomina => 
                nomina.empleado_nombre?.toLowerCase().includes(filtroBusqueda.toLowerCase()) ||
                nomina.id_operador?.toString().includes(filtroBusqueda)
            )
            .map(nomina => nomina.empleado_nombre);
        
        // Filtrar viajes por los operadores encontrados
        return viajesSemana.filter(viaje => 
            operadoresFiltrados.some(nombre => 
                viaje.operador_nombre?.toLowerCase().includes(nombre?.toLowerCase() || '')
            )
        );
    }, [viajesSemana, filtroBusqueda, nominasCalculadas]);

    const cargarDatos = async () => {
        try {
            const [empleadosData, prestamosData, viajesData, clientesData, configData] = await Promise.all([
                fetchOperadores(),
                fetchPrestamosActivos(),
                fetchViajes(),
                fetchClientes(),
                fetchNominaConfiguracion().catch((error) => {
                    console.error('Error al cargar configuración de nómina:', error);
                    return { ...NOMINA_CONFIG_DEFAULT };
                })
            ]);

            setEmpleados(empleadosData);
            setPrestamos(prestamosData);
            setViajes(viajesData);
            setClientes(clientesData);
            setConfigNomina(configData);

        } catch (error) {
            toast.current?.show({
                severity: 'error',
                summary: 'Error',
                detail: 'No se pudieron cargar los datos',
                life: 3000
            });
        }
    };

    const guardarConfiguracionNomina = async () => {
        if (configNomina.meta_rebase < 0 || configNomina.porcentaje_diurno < 0 || configNomina.porcentaje_nocturno_mixto < 0) {
            toast.current?.show({
                severity: 'warn',
                summary: 'Validación',
                detail: 'La meta y los porcentajes no pueden ser negativos',
                life: 3000
            });
            return;
        }

        setGuardandoConfig(true);
        try {
            const configGuardada = await saveNominaConfiguracion(configNomina);
            setConfigNomina(configGuardada);
            toast.current?.show({
                severity: 'success',
                summary: 'Éxito',
                detail: 'Configuración de meta guardada. Se aplicará al calcular la nómina.',
                life: 3000
            });
        } catch (error) {
            console.error('Error al guardar configuración de nómina:', error);
            toast.current?.show({
                severity: 'error',
                summary: 'Error',
                detail: 'No se pudo guardar la configuración',
                life: 3000
            });
        } finally {
            setGuardandoConfig(false);
        }
    };

    const formatMetaCorta = (monto: number) => {
        return monto >= 1000 && monto % 1000 === 0 ? `${monto / 1000}K` : formatCurrency(monto);
    };

    const verificarNominaExistente = async () => {
        setVerificando(true);
        try {
            const semana = getWeekNumber(fechaSeleccionada);
            const anio = fechaSeleccionada.getFullYear();
            
            setSemanaActual(semana);
            setAnioActual(anio);

            const nominasExistentes = await fetchNominasPorSemana(semana, anio);
            
            if (nominasExistentes.length > 0) {
                setNominasCalculadas(nominasExistentes);
                setShowResults(true);
                setNominaGuardada(true);
                
                toast.current?.show({
                    severity: 'info',
                    summary: 'Nómina encontrada',
                    detail: `Ya existe nómina guardada para la semana ${semana} del ${anio}`,
                    life: 3000
                });
            } else {
                setNominaGuardada(false);
            }
        } catch (error) {
            console.error('Error al verificar nómina:', error);
        } finally {
            setVerificando(false);
        }
    };
    //     setCargando(true);
    //     try {
    //         const semana = getWeekNumber(fechaSeleccionada);
    //         const anio = fechaSeleccionada.getFullYear();
    //         const fechaInicio = getStartOfWeek(new Date(fechaSeleccionada));
    //         const fechaFin = getEndOfWeek(new Date(fechaSeleccionada));

    //         const fechaInicioStr = formatDate(fechaInicio);
    //         const fechaFinStr = formatDate(fechaFin);

    //         const todosViajesSemana = viajes.filter(viaje => {
    //             return viaje.fecha >= fechaInicioStr && viaje.fecha <= fechaFinStr;
    //         });
    //         setViajesSemana(todosViajesSemana);

    //         const nominas = empleados
    //             .filter(empleado => empleado.estatus)
    //             .map(empleado => {
    //                 const viajesEmpleado = viajes.filter(viaje => {
    //                     const perteneceAlOperador = viaje.operador_nombre === empleado.nombre;
    //                     const estaEnRango = viaje.fecha >= fechaInicioStr && viaje.fecha <= fechaFinStr;
    //                     return perteneceAlOperador && estaEnRango;
    //                 });

    //                 const totalViajes = viajesEmpleado.reduce((sum, viaje) => {
    //                     return sum + (viaje.caphrsviajes || 0);
    //                 }, 0);

    //                 const salarioBase = empleado.salario_base || 0;
                    
    //                 // Lógica de pago por alcance de meta
    //                 let pagoAlcanceMeta = 0;
    //                 let rebaso = false;
                    
    //                 if (totalViajes > 40000) {
    //                     // Pago del 10% sobre el total generado (47,850 * 0.1 = 4,785)
    //                     pagoAlcanceMeta = totalViajes * 0.1;
    //                     rebaso = true;
    //                 } else {
    //                     // Si no rebasa los 40K, se paga el 10% de 40K (4,000)
    //                     pagoAlcanceMeta = 4000;
    //                     rebaso = false;
    //                 }
                    
    //                 // Bono adicional (inicializado en 0, puedes editarlo después)
    //                 const bonoAdicional = 0;
                    
    //                 // Pago bruto =  Pago por alcance de meta + Bono adicional
    //                 const pagoBruto = pagoAlcanceMeta + bonoAdicional;
                    
    //                 const prestamosEmpleado = prestamos.filter(p => p.id_operador === empleado.id);
    //                 const totalPrestamos = prestamosEmpleado.reduce((sum, p) => sum + p.saldo_pendiente, 0);
                    
    //                 const pagoNeto = pagoBruto - totalPrestamos;

    //                 return {
    //                     id_operador: empleado.id,
    //                     empleado_nombre: empleado.nombre,
    //                     semana,
    //                     anio,
    //                     fecha_inicio: fechaInicioStr,
    //                     fecha_fin: fechaFinStr,
    //                     total_viajes: totalViajes,
    //                     cantidad_viajes: viajesEmpleado.length,
    //                     salario_base: salarioBase,
    //                     pago_alcance_meta: pagoAlcanceMeta, // Pago por alcanzar la meta
    //                     bono: bonoAdicional, // Bono que puedes agregar manualmente
    //                     pago_bruto: pagoBruto,
    //                     rebaso: rebaso,
    //                     prestamos: totalPrestamos,
    //                     pago_neto: pagoNeto > 0 ? pagoNeto : 0,
    //                     estatus: 'Pendiente',
    //                     viajes: viajesEmpleado
    //                 };
    //             });

    //         setNominasCalculadas(nominas);
    //         setShowResults(true);
    //         setNominaGuardada(false);
            
    //         toast.current?.show({
    //             severity: 'success',
    //             summary: 'Éxito',
    //             detail: 'Nómina calculada correctamente',
    //             life: 3000
    //         });
    //     } catch (error) {
    //         console.error('Error al calcular nómina:', error);
    //         toast.current?.show({
    //             severity: 'error',
    //             summary: 'Error',
    //             detail: 'No se pudo calcular la nómina',
    //             life: 3000
    //         });
    //     } finally {
    //         setCargando(false);
    //     }
    // };

    const calcularNomina = async () => {
        setCargando(true);
        try {
            const semana = getWeekNumber(fechaSeleccionada);
            console.log('Semana calculada:', semana);
            const anio = fechaSeleccionada.getFullYear();
            const fechaInicio = getStartOfFixedWeek(new Date(fechaSeleccionada), 5); // Sábado
            console.log('Fecha Inicio sin ajustar:', formatDate(fechaInicio));

            // Ajustar para que la fecha de fin sea el mismo día de la semana que inicio + 6 días (semana completa)
            const fechaInicioStr = formatDate(fechaInicio);
            const fechaFinAjustada = new Date(fechaInicio);
            fechaFinAjustada.setDate(fechaInicio.getDate() + 6); // 6 días después del inicio (sábado + 6 = viernes)
            console.log('Fecha Inicio que filtra:', fechaInicioStr);
            const fechaFinStr = formatDate(fechaFinAjustada);
            console.log('Fecha fin que filtra:', fechaFinStr);

            // Función para calcular monto con descuento administrativo
            const calcularMontoConDescuento = (viaje: any) => {
                const montoOriginal = viaje.caphrsviajes || 0;
                
                // Buscar el cliente en el array de clientes
                const cliente = clientes.find(c => {
                    // Primero por nombre/empresa (case insensitive)
                    const nombreCliente = c.empresa || c.nombre || '';
                    const nombreViaje = viaje.cliente_nombre || '';
                    
                    const coincidePorNombre = nombreCliente.toUpperCase() === nombreViaje.toUpperCase();
                    
                    // También por ID si existe
                    const coincidePorId = c.id === viaje.id_cliente;
                    
                    return coincidePorNombre || coincidePorId;
                });
                
                // Si el cliente tiene porcentaje administrativo, aplicar descuento
                if (cliente && cliente.porcentaje_administrativo && cliente.porcentaje_administrativo > 0) {
                    const porcentaje = cliente.porcentaje_administrativo / 100;
                    const descuento = montoOriginal * porcentaje;
                    return montoOriginal - descuento;
                }
                
                // Si no tiene porcentaje, retornar monto original
                return montoOriginal;
            };

            const todosViajesSemana = viajes.filter(viaje => {
                return viaje.fecha >= fechaInicioStr && viaje.fecha <= fechaFinStr;
            });
            setViajesSemana(todosViajesSemana);

            // Obtener bonos activos
            const bonosActivos = await fetchBonosActivos();
            // Obtener préstamos activos (Pendientes)
            const prestamosActivos = await fetchPrestamosActivos();

            // OBTENER TODOS LOS DESCUENTOS DE UNA SOLA VEZ (UNA SOLA CONSULTA)
            const todosDescuentos = await fetchDescuentos();

            // Crear un mapa de descuentos por operador para acceso rápido
            const descuentosPorOperador = new Map();
            todosDescuentos.forEach(d => {
                if (!descuentosPorOperador.has(d.id_operador)) {
                    descuentosPorOperador.set(d.id_operador, []);
                }
                descuentosPorOperador.get(d.id_operador).push(d);
            });

            const nominasPromises = empleados
                .filter(empleado => empleado.estatus && !empleado.es_externo && !empleado.es_ceo)
                .map(async (empleado) => {
                    const viajesEmpleado = viajes.filter(viaje => {
                        const perteneceAlOperador = viaje.operador_nombre === empleado.nombre;
                        const estaEnRango = viaje.fecha >= fechaInicioStr && viaje.fecha <= fechaFinStr;
                        return perteneceAlOperador && estaEnRango;
                    });

                    // Calcular total usando monto con descuento administrativo
                    const totalViajes = viajesEmpleado.reduce((sum, viaje) => {
                        return sum + calcularMontoConDescuento(viaje);
                    }, 0);

                    // Calcular monto total sin descuento (para referencia)
                    const totalViajesSinDescuento = viajesEmpleado.reduce((sum, viaje) => {
                        return sum + (viaje.caphrsviajes || 0);
                    }, 0);

                    // Calcular descuento total aplicado
                    const descuentoTotal = totalViajesSinDescuento - totalViajes;

                    const salarioBase = empleado.salario_base || 0;
                    
                    // Lógica de pago por alcance de meta con distinto porcentaje según horario
                    let pagoAlcanceMeta = 0;
                    let rebaso = false;

                    // Determinar si el operador tuvo viajes en horario diurno ('D') o nocturno ('N')
                    const tieneViajeDiurno = viajesEmpleado.some(v => v.horario === 'D');
                    const tieneViajeNocturno = viajesEmpleado.some(v => v.horario === 'N');

                    if (totalViajes > configNomina.meta_rebase) {
                        // Si rebasa la meta configurada aplicar porcentaje según horario:
                        // - Si solo tiene viajes diurnos 'D' aplicar porcentaje_diurno
                        // - Si tiene nocturnos o mixtos aplicar porcentaje_nocturno_mixto
                        if (tieneViajeDiurno && !tieneViajeNocturno) {
                            pagoAlcanceMeta = totalViajes * (configNomina.porcentaje_diurno / 100);
                        } else {
                            pagoAlcanceMeta = totalViajes * (configNomina.porcentaje_nocturno_mixto / 100);
                        }
                        rebaso = true;
                    } else {
                        // Si no rebasa la meta, mantener la lógica actual (salario base)
                        // Si prefieres pagar 10% de 40k (4000) cambiar a: pagoAlcanceMeta = 4000;
                        pagoAlcanceMeta = salarioBase;
                        rebaso = false;
                    }
                    
                    // Obtener descuentos del empleado desde el mapa
                    const descuentosEmpleado = (descuentosPorOperador.get(empleado.id) || []) as Descuento[];
                    const today = new Date().toISOString().split('T')[0];
                    const descuentosVigentes = descuentosEmpleado.filter(d => 
                        d.activo === true &&
                        d.fecha_inicio <= today && 
                        (!d.fecha_fin || d.fecha_fin >= today)
                    );

                    const descuento_infonavit = descuentosVigentes
                        .filter(d => d.tipo === 'infonavit')
                        .reduce((sum, d) => sum + d.monto, 0);

                    const descuento_fonacot = descuentosVigentes
                        .filter(d => d.tipo === 'fonacot')
                        .reduce((sum, d) => sum + d.monto, 0);

                    const descuento_prestamos = descuentosVigentes
                        .filter(d => d.tipo === 'viaticos' || d.tipo === 'prestamo')
                        .reduce((sum, d) => sum + d.monto, 0);

                    const otros_descuentos = descuentosVigentes
                        .filter(d => d.tipo === 'otros')
                        .reduce((sum, d) => sum + d.monto, 0);
                    
                    const bonosEmpleado = bonosActivos.filter(bono => 
                        bono.id_operador === empleado.id
                    );
                    const totalBonos = bonosEmpleado.reduce((sum, bono) => sum + (bono.monto || 0), 0);
                    const pagoBruto = pagoAlcanceMeta + totalBonos;
                    
                    const prestamosEmpleado = prestamosActivos.filter(p => p.id_operador === empleado.id);
                    const totalPrestamos = prestamosEmpleado.reduce((sum, p) => sum + (p.saldo_pendiente || 0), 0);
                    
                    const descuentoPrestamoManual = 0;
                    const aplicarDescuentoPrestamo = false;

                    const totalDescuentosAutomaticos = descuento_infonavit + 
                                                        descuento_fonacot + 
                                                        descuento_prestamos + 
                                                        otros_descuentos;

                    const pagoNeto = pagoBruto - totalDescuentosAutomaticos - descuentoPrestamoManual;

                    return {
                        id_operador: empleado.id,
                        empleado_nombre: empleado.nombre,
                        semana,
                        anio,
                        fecha_inicio: fechaInicioStr,
                        fecha_fin: fechaFinStr,
                        total_viajes: totalViajes,
                        total_viajes_sin_descuento: totalViajesSinDescuento,
                        descuento_administrativo: descuentoTotal,
                        cantidad_viajes: viajesEmpleado.length,
                        salario_base: salarioBase,
                        pago_alcance_meta: pagoAlcanceMeta,
                        bono: totalBonos,
                        pago_bruto: pagoBruto,
                        rebaso: rebaso,
                        prestamos_disponibles: totalPrestamos,
                        aplicar_descuento_prestamo: aplicarDescuentoPrestamo,
                        descuento_prestamo: descuentoPrestamoManual,
                        prestamos: 0,
                        descuento_infonavit: descuento_infonavit,
                        descuento_fonacot: descuento_fonacot,
                        otros_descuentos: otros_descuentos,
                        total_descuentos_automaticos: totalDescuentosAutomaticos,
                        pago_neto: pagoNeto > 0 ? pagoNeto : 0,
                        estatus: 'Pendiente',
                        viajes: viajesEmpleado,
                        prestamos_detalle: prestamosEmpleado
                    };
                });

            // ESPERAR A QUE TODAS LAS PROMESAS SE RESUELVAN
            const nominas = await Promise.all(nominasPromises);
            setNominasCalculadas(nominas);
            setShowResults(true);
            setNominaGuardada(false);
            
            toast.current?.show({
                severity: 'success',
                summary: 'Éxito',
                detail: 'Nómina calculada correctamente con descuentos administrativos',
                life: 3000
            });
        } catch (error) {
            console.error('Error al calcular nómina:', error);
            toast.current?.show({
                severity: 'error',
                summary: 'Error',
                detail: 'No se pudo calcular la nómina',
                life: 3000
            });
        } finally {
            setCargando(false);
        }
    };

    const guardarNominas = async () => {
        try {
            // Preparar datos para guardar - incluir TODOS los campos
            const nominasParaGuardar = nominasCalculadas.map(nomina => ({
                // Campos básicos
                id_operador: nomina.id_operador,
                empleado_nombre: nomina.empleado_nombre, // Asegúrate de incluir esto
                semana: nomina.semana,
                anio: nomina.anio,
                fecha_inicio: nomina.fecha_inicio,
                fecha_fin: nomina.fecha_fin,
                total_viajes: nomina.total_viajes,
                
                // Campos que estaban faltando
                salario_base: nomina.salario_base || 0,
                pago_alcance_meta: nomina.pago_alcance_meta || 0,
                rebaso: nomina.rebaso || false,
                cantidad_viajes: nomina.cantidad_viajes || 0,
                
                pago_bruto: nomina.pago_bruto,
                
                // Descuentos
                descuento_imss: 0,
                descuento_isr: 0,
                descuento_infonavit: nomina.descuento_infonavit || 0,
                descuento_fonacot: nomina.descuento_fonacot || 0,
                otros_descuentos: nomina.otros_descuentos || 0,
                
                // Préstamos y deducciones
                prestamos: nomina.prestamos || 0,
                pago_neto: nomina.pago_neto,
                
                // Bonos
                bono: nomina.bono || 0,
                horas_extra: 0,
                otros_bonos: 0,
                
                // Información de pago
                metodo_pago: undefined,
                referencia_pago: undefined,
                fecha_pago: undefined,
                
                estatus: 'Pendiente',
                notas: ''
            }));

            await Promise.all(nominasParaGuardar.map(nomina => createNomina(nomina)));
            
            toast.current?.show({
                severity: 'success',
                summary: 'Éxito',
                detail: 'Nóminas guardadas correctamente',
                life: 3000
            });
            
            setNominasCalculadas([]);
            setShowResults(false);
            setViajesSemana([]);
        } catch (error) {
            console.error('Error al guardar nóminas:', error);
            toast.current?.show({
                severity: 'error',
                summary: 'Error',
                detail: 'No se pudieron guardar las nóminas',
                life: 3000
            });
        }
    };

    const abrirDialogoPrestamo = (nomina: any) => {
        setPrestamoSeleccionado(nomina);
        setMontoDescuento(nomina.descuento_prestamo || 0);
        setAplicarDescuento(nomina.aplicar_descuento_prestamo || false);
        setShowPrestamoDialog(true);
    };

    const guardarDescuentoPrestamo = () => {
        if (!prestamoSeleccionado) return;

        const nominasActualizadas = nominasCalculadas.map(n => {
            if (n.id_operador === prestamoSeleccionado.id_operador) {
                const descuentoFinal = aplicarDescuento ? Math.min(montoDescuento, n.prestamos_disponibles) : 0;
                const nuevoPagoNeto = n.pago_bruto - (n.total_descuentos_automaticos || 0) - descuentoFinal;
                
                return {
                    ...n,
                    aplicar_descuento_prestamo: aplicarDescuento,
                    descuento_prestamo: descuentoFinal,
                    prestamos: descuentoFinal,
                    pago_neto: nuevoPagoNeto > 0 ? nuevoPagoNeto : 0
                };
            }
            return n;
        });

        setNominasCalculadas(nominasActualizadas);
        setShowPrestamoDialog(false);
        
        toast.current?.show({
            severity: 'success',
            summary: 'Éxito',
            detail: 'Descuento de préstamo actualizado',
            life: 3000
        });
    };

    const abrirDialogoPago = async (nomina: any) => {
        setNominaSeleccionada(nomina);
        setMetodoPago(nomina.metodo_pago || '');
        setReferenciaPago(nomina.referencia_pago || '');
        
        // Obtener préstamos actualizados del empleado
        try {
            const prestamosEmpleado = await fetchPrestamosActivos();
            const prestamosFiltrados = prestamosEmpleado.filter(p => p.id_operador === nomina.id_operador);
            
            // Actualizar la nómina con los préstamos actualizados
            setNominaSeleccionada({
                ...nomina,
                prestamos_detalle: prestamosFiltrados
            });
        } catch (error) {
            console.error('Error al obtener préstamos:', error);
        }
        
        setShowPagoDialog(true);
    };

    const procesarPago = async () => {
        try {
            if (!metodoPago) {
                toast.current?.show({
                    severity: 'warn',
                    summary: 'Validación',
                    detail: 'Seleccione un método de pago',
                    life: 3000
                });
                return;
            }

            // Obtener préstamos activos del empleado
            const prestamosEmpleado = await fetchPrestamosActivos();
            const prestamosFiltrados = prestamosEmpleado.filter(p => p.id_operador === nominaSeleccionada.id_operador);
            
            // Usar el campo 'prestamos' que contiene el monto a descontar
            let montoPrestamoAplicado = nominaSeleccionada.prestamos || 0;
            
            // Aplicar pagos a los préstamos si hay descuento configurado
            if (montoPrestamoAplicado > 0 && prestamosFiltrados.length > 0) {
                await aplicarPagoAPrestamos(prestamosFiltrados, montoPrestamoAplicado, nominaSeleccionada.id);
            }

            const nominasActualizadas = nominasCalculadas.map(n => 
                n.id_operador === nominaSeleccionada.id_operador ? 
                { 
                    ...n, 
                    estatus: 'Pagado', 
                    metodo_pago: metodoPago, 
                    referencia_pago: referenciaPago,
                    fecha_pago: new Date().toISOString().split('T')[0]
                } : n
            );

            setNominasCalculadas(nominasActualizadas);

            if (nominaSeleccionada.id) {
                // Crear objeto SOLO con los campos que existen en la tabla
                const camposParaActualizar = {
                    id: nominaSeleccionada.id,
                    estatus: 'Pagado',
                    metodo_pago: metodoPago,
                    referencia_pago: referenciaPago,
                    fecha_pago: new Date().toISOString().split('T')[0],
                    updated_at: new Date().toISOString(),
                    
                    // Campos requeridos por la interfaz Nomina
                    descuento_imss: nominaSeleccionada.descuento_imss || 0,
                    descuento_isr: nominaSeleccionada.descuento_isr || 0,
                    descuento_infonavit: nominaSeleccionada.descuento_infonavit || 0,
                    descuento_fonacot: nominaSeleccionada.descuento_fonacot || 0,
                    otros_descuentos: nominaSeleccionada.otros_descuentos || 0,
                    horas_extra: nominaSeleccionada.horas_extra || 0,
                    otros_bonos: nominaSeleccionada.otros_bonos || 0,
                    notas: nominaSeleccionada.notas || '',
                    prestamos: montoPrestamoAplicado,
                    pago_bruto: nominaSeleccionada.pago_bruto,
                    pago_neto: nominaSeleccionada.pago_neto,
                    bono: nominaSeleccionada.bono || 0,
                    
                    // Campos básicos que deben mantenerse
                    id_operador: nominaSeleccionada.id_operador,
                    empleado_nombre: nominaSeleccionada.empleado_nombre, 
                    semana: nominaSeleccionada.semana,
                    anio: nominaSeleccionada.anio,
                    fecha_inicio: nominaSeleccionada.fecha_inicio,
                    fecha_fin: nominaSeleccionada.fecha_fin,
                    total_viajes: nominaSeleccionada.total_viajes,
                    salario_base: nominaSeleccionada.salario_base || 0,
                    pago_alcance_meta: nominaSeleccionada.pago_alcance_meta || 0,
                    rebaso: nominaSeleccionada.rebaso || false,
                    cantidad_viajes: nominaSeleccionada.cantidad_viajes || 0
                };
                
                // NO incluir campos que no están en la tabla como prestamos_detalle
                await updateNomina(camposParaActualizar);
            }

            toast.current?.show({
                severity: 'success',
                summary: 'Éxito',
                detail: `Pago procesado para ${nominaSeleccionada.empleado_nombre}`,
                life: 3000
            });

            setShowPagoDialog(false);
            setNominaSeleccionada(null);
            
        } catch (error) {
            console.error('Error al procesar pago:', error);
            toast.current?.show({
                severity: 'error',
                summary: 'Error',
                detail: 'No se pudo procesar el pago',
                life: 3000
            });
        }
    };

    // Cuando se aplica un pago a préstamos, distribuir el monto entre los préstamos pendientes cuando se guarda la nómina
    const aplicarPagoAPrestamos = async (prestamos: any[], montoTotal: number, idNomina?: number) => {
        let montoRestante = montoTotal;
        
        // Ordenar préstamos por fecha más antigua primero (FIFO)
        const prestamosOrdenados = [...prestamos].sort((a, b) => 
            new Date(a.fecha_prestamo).getTime() - new Date(b.fecha_prestamo).getTime()
        );
        
        // Crear historial de pagos
        const historialPagos = [];
        
        for (const prestamo of prestamosOrdenados) {
            if (montoRestante <= 0) break;
            
            if (prestamo.estatus === 'Pendiente') {
                const saldoPendiente = prestamo.saldo_pendiente;
                const montoAplicar = Math.min(saldoPendiente, montoRestante);
                
                if (montoAplicar > 0) {
                    try {
                        // Usar la función existente para aplicar pago
                        await aplicarPagoPrestamo(prestamo.id, montoAplicar, idNomina);   
                        
                        // Registrar en historial
                        historialPagos.push({
                            id_prestamo: prestamo.id,
                            monto_aplicado: montoAplicar,
                            saldo_anterior: saldoPendiente,
                            saldo_nuevo: saldoPendiente - montoAplicar,
                            fecha: new Date().toISOString()
                        });
                        
                        montoRestante -= montoAplicar;
                        
                        toast.current?.show({
                            severity: 'info',
                            summary: 'Aplicando pago a préstamo',
                            detail: `Aplicado $${montoAplicar} al préstamo #${prestamo.id}`,
                            life: 2000
                        });
                        
                    } catch (error) {
                        console.error(`Error al aplicar pago al préstamo ${prestamo.id}:`, error);
                        throw error;
                    }
                }
            }
        }
        
        // Si queda monto restante (no debería pasar, pero por si acaso)
        if (montoRestante > 0) {
            console.warn(`Quedó monto restante sin aplicar: $${montoRestante}`);
        }
        
        return historialPagos;
    };

    const leftToolbarTemplate = () => (
        <div className="flex flex-wrap gap-2">
            <div className="p-inputgroup">
                <span className="p-inputgroup-addon">
                    <i className="pi pi-search"></i>
                </span>
                <InputText 
                    placeholder="Buscar operador..." 
                    value={filtroBusqueda}
                    onChange={(e) => setFiltroBusqueda(e.target.value)}
                    className="w-20rem"
                />
                {filtroBusqueda && (
                    <Button 
                        icon="pi pi-times" 
                        className="p-button-text p-button-sm" 
                        onClick={() => setFiltroBusqueda('')}
                    />
                )}
            </div>
            <Button 
                label="Verificar Nómina" 
                icon="pi pi-search" 
                loading={verificando}
                onClick={verificarNominaExistente}
                className="p-button-info"
                tooltip="Verificar si ya existe nómina para esta semana"
            />
            <Button 
                label="Calcular Nómina" 
                icon="pi pi-calculator" 
                loading={cargando}
                onClick={calcularNomina}
                className="p-button-success"
                disabled={nominaGuardada}
            />
            {showResults && !nominaGuardada && (
                <Button 
                    label="Guardar Nóminas" 
                    icon="pi pi-save" 
                    severity="help"
                    onClick={guardarNominas}
                    className="p-button-warning"
                />
            )}
            {nominaGuardada && (
                <Button 
                    label="Nómina Guardada" 
                    icon="pi pi-check" 
                    className="p-button-success"
                    disabled
                />
            )}
        </div>
    );

    const rightToolbarTemplate = () => {
        return (
            <React.Fragment>
                <Button 
                    label="Exportar Excel" 
                    icon="pi pi-file-excel" 
                    severity="success" 
                    onClick={exportToExcel} 
                    className="ml-2"
                    tooltip="Exportar nómina completa con viajes a Excel"
                />
            </React.Fragment>
        );
    };

    const headerTemplate = () => (
        <div className="flex justify-content-between align-items-center">
            <span>
                Resultados de la Pre Nomina - Semana {semanaActual} del {anioActual}
                {nominaGuardada && <i className="pi pi-check-circle text-green-500 ml-2" style={{ fontSize: '1.2rem' }}></i>}
            </span>
            <Button 
                icon="pi pi-times" 
                className="p-button-text p-button-danger" 
                onClick={cerrarResultados}
                tooltip="Cerrar resultados"
            />
        </div>
    );

    const pagoBrutoBodyTemplate = (rowData: any) => {
        return formatCurrency(rowData.pago_bruto);
    };

    const pagoNetoBodyTemplate = (rowData: any) => {
        return (
            <span className={`font-bold ${rowData.pago_neto > 0 ? 'text-green-600' : 'text-red-600'}`}>
                {formatCurrency(rowData.pago_neto)}
            </span>
        );
    };

    const viajesCountBodyTemplate = (rowData: any) => {
        return (
            <div>
                <div className="font-semibold">{rowData.cantidad_viajes} viajes</div>
                <div className="text-sm text-gray-600">{formatCurrency(rowData.total_viajes)} total</div>
            </div>
        );
    };

    const salarioBaseBodyTemplate = (rowData: any) => {
        return formatCurrency(rowData.salario_base);
    };

    // Exportacion de Excel con viajes incluidos
    const exportToExcel = () => {
        try {
            // Crear libro de Excel
            const wb = XLSX.utils.book_new();
            
            // Hoja 1: Datos de nómina (similar a lo que muestra el DataTable)
            const datosNomina = nominasCalculadas.map(nomina => ({
                'Empleado': nomina.empleado_nombre,
                'Estado': nomina.estatus,
                'Método Pago': nomina.metodo_pago || 'N/A',
                'Referencia': nomina.referencia_pago || 'N/A',
                'Viajes': nomina.cantidad_viajes,
                'Total Viajes': formatCurrency(nomina.total_viajes),
                'Salario Base': formatCurrency(nomina.salario_base),
                [`Rebasó ${formatMetaCorta(configNomina.meta_rebase)}`]: nomina.rebaso ? 'Sí' : 'No',
                'Bono': formatCurrency(nomina.bono),
                'Infonavit': formatCurrency(nomina.descuento_infonavit || 0),
                'Fonacot': formatCurrency(nomina.descuento_fonacot || 0),
                'Otros Descuentos': formatCurrency(nomina.otros_descuentos || 0),
                'Total Descuentos': formatCurrency(nomina.total_descuentos_automaticos || 0),
                'Pago Bruto': formatCurrency(nomina.pago_bruto),
                'Préstamos': formatCurrency(nomina.prestamos),
                'Pago Neto': formatCurrency(nomina.pago_neto),
                'Semana': nomina.semana,
                'Año': nomina.anio
            }));
            
            const wsNomina = XLSX.utils.json_to_sheet(datosNomina);
            XLSX.utils.book_append_sheet(wb, wsNomina, 'Nómina');
            
            // Hoja 2: Viajes de los operadores (detallados)
            const datosViajes = [];
            
            // Recopilar viajes de cada operador en la nómina
            for (const nomina of nominasCalculadas) {
                if (nomina.viajes && nomina.viajes.length > 0) {
                    for (const viaje of nomina.viajes) {
                        datosViajes.push({
                            'Operador': nomina.empleado_nombre,
                            'ID Viaje': viaje.id,
                            'Fecha': viaje.fecha,
                            'Folio': viaje.folio,
                            'Folio BCO': viaje.folio_bco,
                            'Monto Viaje': formatCurrency(viaje.caphrsviajes || 0),
                            'Origen': viaje.origen,
                            'Destino': viaje.destino,
                            'Semana Nómina': nomina.semana
                        });
                    }
                }
            }
            
            // Si no hay viajes en los objetos de nómina, usar viajesSemana
            if (datosViajes.length === 0 && viajesSemana.length > 0) {
                for (const viaje of viajesSemana) {
                    datosViajes.push({
                        'Operador': viaje.operador_nombre,
                        'ID Viaje': viaje.id,
                        'Fecha': viaje.fecha,
                        'Folio': viaje.folio,
                        'Folio BCO': viaje.folio_bco,
                        'Monto Viaje': formatCurrency(viaje.caphrsviajes || 0),
                        'Origen': viaje.origen,
                        'Destino': viaje.destino,
                        'Semana Nómina': semanaActual
                    });
                }
            }
            
            if (datosViajes.length > 0) {
                const wsViajes = XLSX.utils.json_to_sheet(datosViajes);
                XLSX.utils.book_append_sheet(wb, wsViajes, 'Viajes');
            }
            
            // Generar nombre de archivo
            const fileName = `Nomina_Semana_${semanaActual}_${anioActual}.xlsx`;
            
            // Descargar archivo
            XLSX.writeFile(wb, fileName);
            
            toast.current?.show({
                severity: 'success',
                summary: 'Éxito',
                detail: 'Archivo Excel exportado correctamente',
                life: 3000
            });
        } catch (error) {
            console.error('Error al exportar a Excel:', error);
            toast.current?.show({
                severity: 'error',
                summary: 'Error',
                detail: 'No se pudo exportar el archivo Excel',
                life: 3000
            });
        }
    };

    const estadoBodyTemplate = (rowData: any) => {
        const isPagado = rowData.estatus === 'Pagado';
        return (
            <span
                className="p-tag"
                style={{
                    backgroundColor: isPagado ? '#22c55e' : '#f59e42',
                    color: 'white',
                    fontWeight: 'bold'
                }}
            >
                {rowData.estatus}
                {isPagado && <i className="pi pi-check ml-1"></i>}
            </span>
        );
    };

    const metodoPagoBodyTemplate = (rowData: any) => {
        if (!rowData.metodo_pago) return '-';
        
        const metodo = metodosPago.find(m => m.value === rowData.metodo_pago);
        return metodo ? metodo.label : rowData.metodo_pago;
    };

    const rebasoBodyTemplate = (rowData: any) => {
        // Asegurarse de manejar tanto boolean como string
        const rebasoValue = typeof rowData.rebaso === 'boolean' 
            ? rowData.rebaso 
            : rowData.rebaso === 'true';
        
        return rebasoValue ? 'Sí' : 'No';
    };

    const bonoBodyTemplate = (rowData: any) => {
        return rowData.bono !== undefined && rowData.bono !== null
            ? formatCurrency(rowData.bono)
            : '-';
    };

    const actionBodyTemplate = (rowData: any) => {
        const handleVerRecibo = () => {
            setNominaParaVistaPrevia(rowData);
            setShowVistaPrevia(true);
        };

        return (
            <div className="flex gap-1">
                {/* Botón para configurar préstamos */}
                {rowData.prestamos_disponibles > 0 && (
                    <Button 
                        icon="pi pi-money-bill" 
                        rounded 
                        severity="warning"
                        tooltip="Configurar descuento de préstamo"
                        tooltipOptions={{ position: 'top' }}
                        onClick={() => abrirDialogoPrestamo(rowData)}
                        className="p-button-sm"
                    />
                )}
                
                {/* Botón para procesar pago */}
                <Button 
                    icon="pi pi-dollar" 
                    rounded 
                    severity="success"
                    tooltip="Procesar pago"
                    tooltipOptions={{ position: 'top' }}
                    onClick={() => abrirDialogoPago(rowData)}
                    disabled={rowData.estatus === 'Pagado' || !nominaGuardada}
                    className="p-button-sm"
                />
                
                {/* Botón para ver recibo */}
                <Button 
                    icon="pi pi-eye" 
                    rounded 
                    severity="info"
                    tooltip="Ver recibo"
                    tooltipOptions={{ position: 'top' }}
                    onClick={handleVerRecibo}
                    className="p-button-sm"
                    disabled={!rowData.empleado_nombre}
                />
            </div>
        );
    };

    const prestamoBodyTemplate = (rowData: any) => {
        return (
            <div className="flex flex-column gap-1">
                <div className="text-sm text-gray-600">
                    Disponible: {formatCurrency(rowData.prestamos_disponibles)}
                </div>
                <div className="font-semibold">
                    Descontar: {formatCurrency(rowData.descuento_prestamo || 0)}
                </div>
                <Button 
                    label="Configurar" 
                    icon="pi pi-cog" 
                    className="p-button-sm p-button-text"
                    onClick={() => abrirDialogoPrestamo(rowData)}
                    disabled={rowData.prestamos_disponibles <= 0}
                />
            </div>
        );
    };

    const footerPagoDialog = (
        <div>
            <Button label="Cancelar" icon="pi pi-times" onClick={() => setShowPagoDialog(false)} className="p-button-text" />
            <Button label="Procesar Pago" icon="pi pi-check" onClick={procesarPago} autoFocus />
        </div>
    );

    const footerPrestamoDialog = (
        <div>
            <Button label="Cancelar" icon="pi pi-times" onClick={() => setShowPrestamoDialog(false)} className="p-button-text" />
            <Button label="Guardar" icon="pi pi-check" onClick={guardarDescuentoPrestamo} autoFocus />
        </div>
    );

    const fechaInicio = getStartOfFixedWeek(new Date(fechaSeleccionada), 5); // viernes
    const fechaFin = getEndOfFixedWeek(new Date(fechaSeleccionada), 5); // jueves

    return (
        <div className="grid crud-demo">
            <div className="col-12">
                <div className="card">
                    <Toast ref={toast} />
                    
                    <div className="flex justify-content-between align-items-center mb-4">
                        <div>
                            <h2 className="text-2xl font-bold mb-1">Módulo de Nómina</h2>
                            <p className="text-gray-600 m-0">Calcula y gestiona los pagos semanales</p>
                        </div>
                        
                        <div className="flex align-items-center gap-2">
                            <Button 
                                icon="pi pi-chevron-left" 
                                onClick={goToPreviousWeek}
                                tooltip="Semana anterior"
                                tooltipOptions={{ position: 'top' }}
                            />
                            
                            <div className="text-center bg-gray-100 p-2 border-round">
                                <div className="font-semibold">
                                    {formatDateDisplay(fechaInicio)} - {formatDateDisplay(fechaFin)}
                                </div>
                                <div className="text-sm text-gray-600">
                                    Semana {getWeekNumber(fechaSeleccionada)} - {fechaSeleccionada.getFullYear()}
                                </div>
                            </div>
                            
                            <Button 
                                icon="pi pi-chevron-right" 
                                onClick={goToNextWeek}
                                tooltip="Semana siguiente"
                                tooltipOptions={{ position: 'top' }}
                            />
                        </div>
                    </div>

                    <Card title="Configuración de Nómina" className="mb-4">
                        <div className="p-fluid grid">
                            <div className="field col-12 md:col-3">
                                <label htmlFor="meta_rebase" className="font-semibold">Meta a rebasar</label>
                                <InputNumber
                                    inputId="meta_rebase"
                                    value={configNomina.meta_rebase}
                                    onValueChange={(e) => setConfigNomina({ ...configNomina, meta_rebase: e.value ?? 0 })}
                                    mode="currency"
                                    currency="MXN"
                                    locale="es-MX"
                                    min={0}
                                />
                                <small className="text-gray-600">Monto generado que debe superar el operador</small>
                            </div>
                            <div className="field col-12 md:col-3">
                                <label htmlFor="porcentaje_diurno" className="font-semibold">% Día</label>
                                <InputNumber
                                    inputId="porcentaje_diurno"
                                    value={configNomina.porcentaje_diurno}
                                    onValueChange={(e) => setConfigNomina({ ...configNomina, porcentaje_diurno: e.value ?? 0 })}
                                    suffix=" %"
                                    min={0}
                                    max={100}
                                    minFractionDigits={0}
                                    maxFractionDigits={2}
                                />
                                <small className="text-gray-600">Si todos sus viajes fueron de día</small>
                            </div>
                            <div className="field col-12 md:col-3">
                                <label htmlFor="porcentaje_nocturno_mixto" className="font-semibold">% Noche</label>
                                <InputNumber
                                    inputId="porcentaje_nocturno_mixto"
                                    value={configNomina.porcentaje_nocturno_mixto}
                                    onValueChange={(e) => setConfigNomina({ ...configNomina, porcentaje_nocturno_mixto: e.value ?? 0 })}
                                    suffix=" %"
                                    min={0}
                                    max={100}
                                    minFractionDigits={0}
                                    maxFractionDigits={2}
                                />
                                <small className="text-gray-600">Si tuvo algún viaje de noche</small>
                            </div>
                            <div className="field col-12 md:col-3 flex align-items-center">
                                <Button
                                    label="Guardar Configuración"
                                    icon="pi pi-save"
                                    loading={guardandoConfig}
                                    onClick={guardarConfiguracionNomina}
                                    className="p-button-warning"
                                />
                            </div>
                            <div className="field col-12 md:col-12 flex items-end justify-content-end gap-2">
                                <Button 
                                    label="Verificar" 
                                    icon="pi pi-search" 
                                    loading={verificando}
                                    onClick={verificarNominaExistente}
                                    className="p-button-info w-full md:w-auto"
                                />
                                <Button 
                                    label="Calcular" 
                                    icon="pi pi-calculator" 
                                    loading={cargando}
                                    onClick={calcularNomina}
                                    className="p-button-success w-full md:w-auto"
                                    disabled={nominaGuardada}
                                />
                            </div>
                        </div>
                    </Card>

                    {showResults && nominasCalculadas.length > 0 && (
                        <>
                            <Card title={headerTemplate} className="mb-4">
                                <Toolbar className="mb-4" left={leftToolbarTemplate} right={rightToolbarTemplate} />
                                
                                <DataTable
                                    ref={dt}
                                    value={datosFiltrados}
                                    paginator
                                    rows={10}
                                    rowsPerPageOptions={[5, 10, 25]}
                                    className="datatable-responsive"
                                    emptyMessage="No se encontraron resultados"
                                >
                                    <Column field="empleado_nombre" header="Empleado" sortable />
                                    <Column field="estatus" header="Estado" body={estadoBodyTemplate} style={{ width: '150px', minWidth: '120px' }} />
                                    <Column field="metodo_pago" header="Método Pago" body={metodoPagoBodyTemplate} />
                                    <Column field="referencia_pago" header="Referencia" />
                                    <Column field="cantidad_viajes" header="Viajes" body={viajesCountBodyTemplate} />
                                    <Column field="salario_base" header="Salario Base" body={salarioBaseBodyTemplate} />
                                    <Column field="rebaso" header={`Rebasó ${formatMetaCorta(configNomina.meta_rebase)}`} body={rebasoBodyTemplate} />
                                    <Column field="bono" header="Bono" body={bonoBodyTemplate} />
                                    <Column field="descuento_infonavit" header="Infonavit" body={(row) => formatCurrency(row.descuento_infonavit)} />
                                    <Column field="descuento_fonacot" header="Fonacot" body={(row) => formatCurrency(row.descuento_fonacot)} />
                                    <Column field="otros_descuentos" header="Otros" body={(row) => formatCurrency(row.otros_descuentos)} />
                                    <Column field="total_descuentos_automaticos" header="Total Desc." body={(row) => formatCurrency(row.total_descuentos_automaticos)} />
                                    <Column field="pago_bruto" header="Pago Bruto" body={pagoBrutoBodyTemplate} />
                                    <Column field="prestamos" header="Préstamos" body={(row) => formatCurrency(row.prestamos)} />
                                    <Column field="pago_neto" header="Pago Neto" body={pagoNetoBodyTemplate} />
                                    <Column header="Acciones" body={actionBodyTemplate} />
                                </DataTable>
                            </Card>

                            {viajesSemana.length > 0 && (
                                <Card 
                                    title={
                                        <div className="flex justify-content-between align-items-center w-full">
                                            <div className="flex align-items-center gap-3">
                                                <span className="text-lg font-semibold">
                                                    Viajes de la Semana
                                                    <span className="ml-2 text-sm text-gray-600 font-normal">
                                                        (Total: {viajesSemana.length} viajes)
                                                    </span>
                                                </span>
                                                <span className="text-sm text-gray-600">
                                                    | Monto Generado: 
                                                    <span className="font-bold text-green-600 ml-1">
                                                        {formatCurrency(calcularTotalViajesSemana(viajesFiltrados))}
                                                    </span>
                                                    {filtroBusqueda && (
                                                        <span className="ml-2 text-sm text-gray-500">
                                                            (filtrado de {formatCurrency(calcularTotalViajesSemana(viajesSemana))})
                                                        </span>
                                                    )}
                                                </span>
                                            </div>
                                        </div>
                                    } 
                                    className="mb-4"
                                    >
                                    <DataTable
                                        value={viajesFiltrados}
                                        paginator
                                        rows={5}
                                        emptyMessage={filtroBusqueda ? "No hay viajes para el operador seleccionado" : "No se encontraron viajes"}
                                        className="p-datatable-sm"
                                    >
                                        <Column field="id" header="ID Viaje" />
                                        <Column field="operador_nombre" header="Operador" />
                                        <Column field="cliente_nombre" header="Cliente" />
                                        <Column 
                                            field="fecha" 
                                            header="Fecha" 
                                            body={(row) => {
                                                if (!row.fecha) return '-';
                                                const [year, month, day] = row.fecha.split('T')[0].split('-');
                                                return `${day}-${month}-${year}`;
                                            }} 
                                        />
                                        <Column field="folio" header="Folio" />
                                        <Column field="folio_bco" header="Folio BCO" />
                                        <Column 
                                            header="Monto Flete" 
                                            body={(row) => formatCurrency(row.caphrsviajes || 0)} 
                                        />
                                        <Column 
                                            header="% Admin" 
                                            body={(row) => {
                                                // Buscar cliente para este viaje
                                                const cliente = clientes.find(c => {
                                                    const nombreCliente = c.empresa || c.nombre || '';
                                                    const nombreViaje = row.cliente_nombre || '';
                                                    const coincidePorNombre = nombreCliente.toUpperCase() === nombreViaje.toUpperCase();
                                                    const coincidePorId = c.id === row.id_cliente;
                                                    return coincidePorNombre || coincidePorId;
                                                });
                                                
                                                if (cliente && cliente.porcentaje_administrativo && cliente.porcentaje_administrativo > 0) {
                                                    return <span className="text-red-600 font-semibold">{cliente.porcentaje_administrativo}%</span>;
                                                }
                                                return '0%';
                                            }} 
                                        />
                                        <Column 
                                            header="Monto Neto" 
                                            body={(row) => {
                                                const montoOriginal = row.caphrsviajes || 0;
                                                // Calcular descuento para esta fila
                                                const cliente = clientes.find(c => {
                                                    const nombreCliente = c.empresa || c.nombre || '';
                                                    const nombreViaje = row.cliente_nombre || '';
                                                    const coincidePorNombre = nombreCliente.toUpperCase() === nombreViaje.toUpperCase();
                                                    const coincidePorId = c.id === row.id_cliente;
                                                    return coincidePorNombre || coincidePorId;
                                                });
                                                
                                                let montoNeto = montoOriginal;
                                                if (cliente && cliente.porcentaje_administrativo && cliente.porcentaje_administrativo > 0) {
                                                    const porcentaje = cliente.porcentaje_administrativo / 100;
                                                    const descuento = montoOriginal * porcentaje;
                                                    montoNeto = montoOriginal - descuento;
                                                }
                                                
                                                return formatCurrency(montoNeto);
                                            }} 
                                        />
                                        <Column 
                                            header="Diferencia" 
                                            body={(row) => {
                                                const montoOriginal = row.caphrsviajes || 0;
                                                // Calcular descuento para esta fila
                                                const cliente = clientes.find(c => {
                                                    const nombreCliente = c.empresa || c.nombre || '';
                                                    const nombreViaje = row.cliente_nombre || '';
                                                    const coincidePorNombre = nombreCliente.toUpperCase() === nombreViaje.toUpperCase();
                                                    const coincidePorId = c.id === row.id_cliente;
                                                    return coincidePorNombre || coincidePorId;
                                                });
                                                
                                                let diferencia = 0;
                                                if (cliente && cliente.porcentaje_administrativo && cliente.porcentaje_administrativo > 0) {
                                                    const porcentaje = cliente.porcentaje_administrativo / 100;
                                                    diferencia = montoOriginal * porcentaje;
                                                }
                                                
                                                if (diferencia > 0) {
                                                    return <span className="text-red-600">{formatCurrency(diferencia)}</span>;
                                                }
                                                return '-';
                                            }} 
                                        />
                                        <Column field="origen" header="Origen" />
                                        <Column field="destino" header="Destino" />
                                        <Column field="horario" header="Horario" />
                                    </DataTable>
                                </Card>
                            )}
                        </>
                    )}

                    <Dialog 
                        visible={showPagoDialog} 
                        style={{ width: '600px' }} 
                        header="Procesar Pago" 
                        modal 
                        footer={footerPagoDialog}
                        onHide={() => setShowPagoDialog(false)}
                    >
                        {nominaSeleccionada && (
                            <div className="p-fluid">
                                <div className="field">
                                    <label>Empleado</label>
                                    <InputText value={nominaSeleccionada.empleado_nombre} readOnly />
                                </div>
                                
                                <div className="grid">
                                    <div className="col-6">
                                        <div className="field">
                                            <label>Pago Bruto</label>
                                            <InputText 
                                                value={formatCurrency(nominaSeleccionada.pago_bruto)} 
                                                readOnly 
                                                className="bg-blue-50"
                                            />
                                        </div>
                                    </div>
                                    <div className="col-6">
                                        <div className="field">
                                            <label>Pago Neto</label>
                                            <InputText 
                                                value={formatCurrency(nominaSeleccionada.pago_neto)} 
                                                readOnly 
                                                className={nominaSeleccionada.pago_neto > 0 ? 'bg-green-50' : 'bg-red-50'}
                                            />
                                        </div>
                                    </div>
                                </div>
                                
                                {nominaSeleccionada.prestamos > 0 && (
                                    <div className="field">
                                        <label className="text-red-600 font-semibold">Descuento por Préstamo</label>
                                        <InputText 
                                            value={formatCurrency(nominaSeleccionada.prestamos)} 
                                            readOnly 
                                            className="bg-red-50 font-bold"
                                        />
                                        <small className="text-gray-600">
                                            Este monto se aplicará automáticamente a los préstamos pendientes
                                        </small>
                                    </div>
                                )}
                                
                                <div className="field">
                                    <label>Método de Pago *</label>
                                    <Dropdown 
                                        value={metodoPago} 
                                        options={metodosPago} 
                                        onChange={(e) => setMetodoPago(e.value)} 
                                        placeholder="Seleccione método"
                                        className="w-full"
                                    />
                                </div>
                                <div className="field">
                                    <label>Referencia/Comprobante</label>
                                    <InputText 
                                        value={referenciaPago} 
                                        onChange={(e) => setReferenciaPago(e.target.value)} 
                                        placeholder="Número de referencia"
                                    />
                                </div>
                                
                                {/* Mostrar préstamos que se van a afectar */}
                                {nominaSeleccionada.prestamos > 0 && nominaSeleccionada.prestamos_detalle && (
                                    <div className="field">
                                        <label className="font-semibold">Préstamos que se afectarán:</label>
                                        <div className="border-1 border-gray-300 border-round p-2 mt-1 max-h-8rem overflow-auto">
                                            {nominaSeleccionada.prestamos_detalle
                                                .filter((p: any) => p.estatus === 'Pendiente')
                                                .map((prestamo: any, index: number) => (
                                                    <div key={index} className="mb-2 p-2 border-bottom-1 border-gray-200">
                                                        <div className="flex justify-content-between align-items-center">
                                                            <div>
                                                                <span className="font-medium">Préstamo #{prestamo.id}</span>
                                                                <div className="text-sm text-gray-600">
                                                                    {prestamo.descripcion || 'Sin descripción'}
                                                                </div>
                                                            </div>
                                                            <div className="text-right">
                                                                <div className="font-medium">
                                                                    Saldo: {formatCurrency(prestamo.saldo_pendiente)}
                                                                </div>
                                                                <div className="text-sm text-gray-600">
                                                                    Fecha: {prestamo.fecha_prestamo}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                ))
                                            }
                                            {nominaSeleccionada.prestamos_detalle.filter((p: any) => p.estatus === 'Pendiente').length === 0 && (
                                                <div className="text-center text-gray-500 py-2">
                                                    No hay préstamos pendientes
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}
                                
                                {nominaSeleccionada.prestamos > 0 && (!nominaSeleccionada.prestamos_detalle || nominaSeleccionada.prestamos_detalle.length === 0) && (
                                    <div className="field">
                                        <div className="p-3 border-1 border-yellow-300 border-round bg-yellow-50">
                                            <i className="pi pi-exclamation-triangle mr-2 text-yellow-600"></i>
                                            <span className="text-yellow-700">
                                                No se encontraron préstamos activos para aplicar el descuento. 
                                                El monto se descontará del pago neto.
                                            </span>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </Dialog>
                    {/* Modal de Vista Previa */}
                    <ModalVistaPrevia 
                        visible={showVistaPrevia}
                        onHide={() => setShowVistaPrevia(false)}
                        nomina={nominaParaVistaPrevia}
                    />

                    <Dialog 
                        visible={showPrestamoDialog} 
                        style={{ width: '500px' }} 
                        header="Configurar Descuento de Préstamo" 
                        modal 
                        footer={footerPrestamoDialog}
                        onHide={() => setShowPrestamoDialog(false)}
                    >
                        {prestamoSeleccionado && (
                            <div className="p-fluid">
                                <div className="field">
                                    <label>Empleado</label>
                                    <InputText value={prestamoSeleccionado.empleado_nombre} readOnly />
                                </div>
                                
                                <div className="field">
                                    <label>Total Préstamos Disponibles</label>
                                    <InputText 
                                        value={formatCurrency(prestamoSeleccionado.prestamos_disponibles)} 
                                        readOnly 
                                    />
                                </div>
                                
                                <div className="field-checkbox mb-3">
                                    <Checkbox 
                                        inputId="aplicarDescuento" 
                                        checked={aplicarDescuento}
                                        onChange={(e) => setAplicarDescuento(e.checked || false)}
                                    />
                                    <label htmlFor="aplicarDescuento" className="ml-2">
                                        Aplicar descuento de préstamo
                                    </label>
                                </div>
                                
                                {aplicarDescuento && (
                                    <div className="field">
                                        <label>Monto a Descontar *</label>
                                        <InputNumber 
                                            value={montoDescuento}
                                            onValueChange={(e) => setMontoDescuento(e.value || 0)}
                                            mode="currency"
                                            currency="MXN"
                                            min={0}
                                            max={prestamoSeleccionado.prestamos_disponibles}
                                            className="w-full"
                                        />
                                        <small className="text-gray-600">
                                            Máximo disponible: {formatCurrency(prestamoSeleccionado.prestamos_disponibles)}
                                        </small>
                                    </div>
                                )}
                                
                                {prestamoSeleccionado.prestamos_detalle && prestamoSeleccionado.prestamos_detalle.length > 0 && (
                                    <div className="field">
                                        <label>Préstamos Activos</label>
                                        <div className="border-1 border-gray-300 border-round p-2 max-h-10rem overflow-auto">
                                            {prestamoSeleccionado.prestamos_detalle.map((prestamo: any, index: number) => (
                                                <div key={index} className="mb-2 p-2 border-bottom-1 border-gray-200">
                                                    <div className="flex justify-content-between">
                                                        <span className="font-medium">Préstamo #{prestamo.id}</span>
                                                        <span>{formatCurrency(prestamo.saldo_pendiente)}</span>
                                                    </div>
                                                    <div className="text-sm text-gray-600">
                                                        Fecha: {prestamo.fecha_prestamo}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </Dialog>
                </div>
            </div>
        </div>
    );
};

    const useReactToPrint = ({ content, documentTitle }: { content: () => any; documentTitle: string; }) => {
    return useCallback(() => {
        const printContent = content();
        if (!printContent) return;

        const printWindow = window.open('', '_blank');
        if (!printWindow) return;

        printWindow.document.write(`
        <html>
            <head>
            <title>${documentTitle}</title>
            <style>
                @media print {
                body {
                    background: white !important;
                    margin: 0;
                    padding: 0;
                }
                .payroll-receipt {
                    position: absolute;
                    left: 0;
                    top: 0;
                    width: 100%;
                }
                body > * {
                    visibility: hidden;
                }
                .payroll-receipt,
                .payroll-receipt * {
                    visibility: visible;
                }
                }
            </style>
            </head>
            <body>
            ${printContent.outerHTML}
            </body>
        </html>
        `);
        printWindow.document.close();
        printWindow.focus();
        printWindow.print();
    }, [content, documentTitle]);
    };

export default NominaModule;
