/* eslint-disable @next/next/no-img-element */
'use client';
import { Button } from 'primereact/button';
import { Chart } from 'primereact/chart';
import { Column } from 'primereact/column';
import { DataTable } from 'primereact/datatable';
import { Menu } from 'primereact/menu';
import React, { useContext, useEffect, useRef, useState } from 'react';
import { LayoutContext } from '../../layout/context/layoutcontext';
import Link from 'next/link';
import { ChartData, ChartOptions } from 'chart.js';
import { Viaje, fetchViajes } from '../../Services/BD/viajeService';
import { Gasto, fetchGastos } from '../../Services/BD/gastoService';
import { CajaChica, fetchCajaChica } from '../../Services/BD/cajaChicaService';
import { fetchTodosClientesConCuentas } from '../../Services/BD/cuentasPorCobrarService';
import { getProductos, Inventario } from '../../Services/BD/inventario/inventarioService';
import { getUserRoleIdFromLocalStorage } from '@/Services/BD/userService';
import LogisticaTabla from '../../app/(main)/pages/crud/Logistica/LogisticaEmpleadoTabla';
import LogisticaAdmin from '../../app/(main)/pages/crud/Logistica/LogisticaAdmin';

const lineData: ChartData = {
    labels: ['January', 'February', 'March', 'April', 'May', 'June', 'July'],
    datasets: [
        {
            label: 'First Dataset',
            data: [65, 59, 80, 81, 56, 55, 40],
            fill: false,
            backgroundColor: '#2f4860',
            borderColor: '#2f4860',
            tension: 0.4
        },
        {
            label: 'Second Dataset',
            data: [28, 48, 40, 19, 86, 27, 90],
            fill: false,
            backgroundColor: '#00bb7e',
            borderColor: '#00bb7e',
            tension: 0.4
        }
    ]
};

// Función para calcular el total de horas de viaje (subtotal)
const calcularTotalHorasViajes = (viajes: Viaje[]): number => {
    return viajes.reduce((total, item) => {
        const horas = item.caphrsviajes || 0;
        return total + horas;
    }, 0);
};

// Función para calcular el total de viajes
const calcularTotalViajes = (viajes: Viaje[]): number => {
    return viajes.length;
};

// Función para calcular el total de gastos
const calcularTotalGastos = (gastos: Gasto[]): number => {
    return gastos.reduce((total, item) => {
        const importe = item.importe || 0;
        return total + importe;
    }, 0);
};

// Función para calcular el saldo total de la empresa
const calcularSaldoTotal = (cajaChicaList: CajaChica[]): number => {
    return cajaChicaList.reduce((total, item) => {
        const ingreso = item.ingreso || 0;
        const egreso = item.egreso || 0;
        return total + ingreso - egreso;
    }, 0);
};

// Función para calcular el valor monetario total del inventario (stock actual x precio por unidad)
const calcularValorInventario = (productos: Inventario[]): number => {
    return productos.reduce((total, item) => {
        return total + item.stock_actual * (item.precio_compra || 0);
    }, 0);
};

const Dashboard = () => {
    const [viajes, setViajes] = useState<Viaje[]>([]);
    const [gastos, setGastos] = useState<Gasto[]>([]);
    const [cajaChica, setCajaChica] = useState<CajaChica[]>([]);
    const [totalPorCobrar, setTotalPorCobrar] = useState<number>(0);
    const [totalInventario, setTotalInventario] = useState<number>(0);
    const [loading, setLoading] = useState(true);
    const menu1 = useRef<Menu>(null);
    const menu2 = useRef<Menu>(null);
    const [lineOptions, setLineOptions] = useState<ChartOptions>({});
    const { layoutConfig } = useContext(LayoutContext);
    const userRoleId = getUserRoleIdFromLocalStorage();
    console.log('userRoleId', userRoleId);
    const isAdmin = userRoleId === 1;
    const isAlmacen = userRoleId === 4;
    const isEmpleado = userRoleId === 2;
    const isLogistica = userRoleId === 5;
    console.log('isAdmin', isAdmin);

    const formattedDate = new Date().toLocaleDateString('es-PE', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });

    // Cargar todos los datos para el dashboard
    useEffect(() => {
        loadDashboardData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const loadDashboardData = async () => {
        try {
            setLoading(true);
            const [viajesData, gastosData, cajaChicaData, cuentasData, productosInventario] = await Promise.all([
                fetchViajes(),
                fetchGastos(),
                fetchCajaChica(),
                loadCuentasPorCobrar(),
                getProductos()
            ]);

            setViajes(viajesData);
            setGastos(gastosData);
            setCajaChica(cajaChicaData);
            setTotalInventario(calcularValorInventario(productosInventario));
        } catch (error) {
            console.error('Error loading dashboard data:', error);
        } finally {
            setLoading(false);
        }
    };

    // Función para cargar cuentas por cobrar
    const loadCuentasPorCobrar = async () => {
        try {
            const data = await fetchTodosClientesConCuentas();
            const total = data.reduce((sum: number, c: any) => sum + (c.total_adeudado || 0), 0);
            setTotalPorCobrar(Math.max(0, total));
            return data;
        } catch (error) {
            console.error('Error loading cuentas por cobrar:', error);
            setTotalPorCobrar(0);
            return [];
        }
    };

    const applyLightTheme = () => {
        const lineOptions: ChartOptions = {
            plugins: {
                legend: {
                    labels: {
                        color: '#495057'
                    }
                }
            },
            scales: {
                x: {
                    ticks: {
                        color: '#495057'
                    },
                    grid: {
                        color: '#ebedef'
                    }
                },
                y: {
                    ticks: {
                        color: '#495057'
                    },
                    grid: {
                        color: '#ebedef'
                    }
                }
            }
        };
        setLineOptions(lineOptions);
    };

    const applyDarkTheme = () => {
        const lineOptions = {
            plugins: {
                legend: {
                    labels: {
                        color: '#ebedef'
                    }
                }
            },
            scales: {
                x: {
                    ticks: {
                        color: '#ebedef'
                    },
                    grid: {
                        color: 'rgba(160, 167, 181, .3)'
                    }
                },
                y: {
                    ticks: {
                        color: '#ebedef'
                    },
                    grid: {
                        color: 'rgba(160, 167, 181, .3)'
                    }
                }
            }
        };
        setLineOptions(lineOptions);
    };

    useEffect(() => {
        if (layoutConfig.colorScheme === 'light') {
            applyLightTheme();
        } else {
            applyDarkTheme();
        }
    }, [layoutConfig.colorScheme]);

    return (
        <div className="grid">
            {/* El resto de tu contenido existente del dashboard */}
            {!isEmpleado && (
                <div className="col-12">
                    <div className="card">
                        <h5>Resumen General</h5>
                        <p>Dashboard principal con métricas clave del sistema.</p>
                    </div>
                </div>
            )}

            {/* Renderizar la tabla de logística solo si el usuario es un empleado */}
            {isEmpleado && (
                <div className="col-12">
                    <div className="card p-4">
                        <div className="flex align-items-center justify-content-between mb-4 flex-wrap gap-2">
                            <div>
                                <h4 className="m-0">Bienvenido</h4>
                                <p className="m-0 text-500">Viajes pendientes por realizar hoy</p>
                            </div>
                            <div>
                                <span className="text-500">Fecha:</span>
                                <div className="text-900 font-medium">{formattedDate}</div>
                            </div>
                        </div>
                        <div className="surface-border border-round p-3">
                            <LogisticaTabla />
                        </div>
                    </div>
                </div>
            )}
            
            {/* Card 1: Sub Total - Gestión de Notas de Viajes */}
            {!isAlmacen && !isEmpleado && !isLogistica && (
                <>
                    <div className="col-12 lg:col-6 xl:col-3">
                <Link href="/uikit/formlayout?module=Viajes" className="no-underline">
                    <div className="card mb-0 cursor-pointer hover:shadow-2 transition-all transition-duration-300">
                        <div className="flex justify-content-between mb-3">
                            <div>
                                <span className="block text-500 font-medium mb-3">Sub Total - Sin IVA</span>
                                <div className="text-900 font-medium text-xl">
                                    {loading ? (
                                        <i className="pi pi-spinner pi-spin"></i>
                                    ) : (
                                        `$ ${calcularTotalHorasViajes(viajes).toLocaleString('en-US', { 
                                            minimumFractionDigits: 2, 
                                            maximumFractionDigits: 2 
                                        })}`
                                    )}
                                </div>
                            </div>
                            <div className="flex align-items-center justify-content-center bg-green-100 border-round" style={{ width: '2.5rem', height: '2.5rem' }}>
                                <i className="pi pi-clock text-black-500 text-xl" />
                            </div>
                        </div>
                        <span className="text-500 text-blue-500">Click para ver detalles</span>
                    </div>
                </Link>
            </div>

            {/* Card 2: Total de Viajes */}
            <div className="col-12 lg:col-6 xl:col-3">
                <Link href="/uikit/formlayout?module=Viajes" className="no-underline">
                    <div className="card mb-0 cursor-pointer hover:shadow-2 transition-all transition-duration-300">
                        <div className="flex justify-content-between mb-3">
                            <div>
                                <span className="block text-500 font-medium mb-3">Total de Viajes</span>
                                <div className="text-900 font-medium text-xl">
                                    {loading ? (
                                        <i className="pi pi-spinner pi-spin"></i>
                                    ) : (
                                        calcularTotalViajes(viajes).toLocaleString()
                                    )}
                                </div>
                            </div>
                            <div className="flex align-items-center justify-content-center bg-cyan-100 border-round" style={{ width: '2.5rem', height: '2.5rem' }}>
                                <i className="pi pi-car text-cyan-500 text-xl" />
                            </div>
                        </div>
                        <span className="text-500 text-blue-500">Click para ver detalles</span>
                    </div>
                </Link>
            </div>

            {/* Card 3: Total de Gastos */}

            {/*<div className="col-12 lg:col-6 xl:col-3">
                <Link href="/uikit/formlayout?module=Gastos" className="no-underline">
                    <div className="card mb-0 cursor-pointer hover:shadow-2 transition-all transition-duration-300">
                        <div className="flex justify-content-between mb-3">
                            <div>
                                <span className="block text-500 font-medium mb-3">Total de Gastos</span>
                                <div className="text-900 font-medium text-xl">
                                    {loading ? (
                                        <i className="pi pi-spinner pi-spin"></i>
                                    ) : (
                                        `$ ${calcularTotalGastos(gastos).toLocaleString('en-US', { 
                                            minimumFractionDigits: 2, 
                                            maximumFractionDigits: 2 
                                        })}`
                                    )}
                                </div>
                            </div>
                            <div className="flex align-items-center justify-content-center bg-purple-100 border-round" style={{ width: '2.5rem', height: '2.5rem' }}>
                                <i className="pi pi-money-bill text-purple-500 text-xl" />
                            </div>
                        </div>
                        <span className="text-500 text-blue-500">Click para ver detalles</span>
                    </div>
                </Link>
            </div>*/}
            

            {/* Card 4: Resumen general del dinero de la empresa */}
            {/* <div className="col-12 lg:col-6 xl:col-3">
                <Link href="/uikit/formlayout?module=Caja Negra" className="no-underline">
                    <div className="card mb-0 cursor-pointer hover:shadow-2 transition-all transition-duration-300">
                        <div className="flex justify-content-between mb-3">
                            <div>
                                <span className="block text-500 font-medium mb-3">Saldo Empresa</span>
                                <div 
                                    className="text-900 font-medium text-xl"
                                    style={{ color: calcularSaldoTotal(cajaChica) >= 0 ? 'green' : 'red' }}
                                >
                                    {loading ? (
                                        <i className="pi pi-spinner pi-spin"></i>
                                    ) : (
                                        `$ ${calcularSaldoTotal(cajaChica).toLocaleString('en-US', { 
                                            minimumFractionDigits: 2, 
                                            maximumFractionDigits: 2 
                                        })}`
                                    )}
                                </div>
                            </div>
                            <div className="flex align-items-center justify-content-center bg-orange-100 border-round" style={{ width: '2.5rem', height: '2.5rem' }}>
                                <i className="pi pi-building text-orange-500 text-xl" />
                            </div>
                        </div>
                        <span className="text-500 text-blue-500">Click para ver detalles</span>
                    </div>
                </Link>
            </div> */}

            

            {/* Card 5: Cuentas por Cobrar - Clickable */}
            <div className="col-12 lg:col-6 xl:col-3">
                <Link href="/uikit/input" className="no-underline">
                    <div className="card mb-0 cursor-pointer hover:shadow-2 transition-all transition-duration-300">
                        <div className="flex justify-content-between mb-3">
                            <div>
                                <span className="block text-500 font-medium mb-3">Cuentas por Cobrar</span>
                                <div 
                                    className="text-900 font-medium text-xl"
                                    style={{ color: totalPorCobrar > 0 ? 'var(--green-500)' : 'var(--orange-500)' }}
                                >
                                    {loading ? (
                                        <i className="pi pi-spinner pi-spin"></i>
                                    ) : (
                                        `$ ${totalPorCobrar.toLocaleString('en-US', { 
                                            minimumFractionDigits: 2, 
                                            maximumFractionDigits: 2 
                                        })}`
                                    )}
                                </div>
                            </div>
                            <div className="flex align-items-center justify-content-center bg-red-100 border-round" style={{ width: '2.5rem', height: '2.5rem' }}>
                                <i className="pi pi-credit-card text-red-500 text-xl" />
                            </div>
                        </div>
                        <span className="text-500 text-blue-500">Click para ver detalles</span>
                    </div>
                </Link>
            </div>

            {/* Card 6: Total de Inventario - solo visible para el admin */}
            {isAdmin && (
                <div className="col-12 lg:col-6 xl:col-3">
                    <Link href="/inventario" className="no-underline">
                        <div className="card mb-0 cursor-pointer hover:shadow-2 transition-all transition-duration-300">
                            <div className="flex justify-content-between mb-3">
                                <div>
                                    <span className="block text-500 font-medium mb-3">Total de Inventario</span>
                                    <div className="text-900 font-medium text-xl">
                                        {loading ? (
                                            <i className="pi pi-spinner pi-spin"></i>
                                        ) : (
                                            `$ ${totalInventario.toLocaleString('en-US', {
                                                minimumFractionDigits: 2,
                                                maximumFractionDigits: 2
                                            })}`
                                        )}
                                    </div>
                                </div>
                                <div className="flex align-items-center justify-content-center bg-blue-100 border-round" style={{ width: '2.5rem', height: '2.5rem' }}>
                                    <i className="pi pi-box text-blue-500 text-xl" />
                                </div>
                            </div>
                            <span className="text-500 text-blue-500">Click para ver detalles</span>
                        </div>
                    </Link>
                </div>
            )}

            {/* card 7: Seguimineto de viajes tirados */}
            <div className="col-12 surface-border border-round p-3">
                <LogisticaAdmin />
            </div>

            </>
        )}
        </div>
    );
};

export default Dashboard;