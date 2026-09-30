/* eslint-disable @next/next/no-img-element */

import React, { useContext } from 'react';
import AppMenuitem from './AppMenuitem';
import { LayoutContext } from './context/layoutcontext';
import { MenuProvider } from './context/menucontext';
import Link from 'next/link';
import { AppMenuItem } from '@/types';
import { getUserRoleIdFromLocalStorage, getModulosPermitidosFromLocalStorage } from '@/Services/BD/userService';

// Definición de roles para mejor legibilidad
const ROLES = {
    ADMIN: 1,
    EMPLEADO: 2,
    ALMACEN: 4,
    LOGISTICA: 5
} as const;

const AppMenu = () => {
    const { layoutConfig } = useContext(LayoutContext);
    const userRoleId = getUserRoleIdFromLocalStorage();
    const esAdmin = userRoleId === ROLES.ADMIN;

    // Qué módulos puede ver este usuario se asigna por cuenta desde
    // Administración > Control de Accesos (Services/BD/permisosService.ts),
    // ya no por un set fijo de 4 roles. Admin ve todo sin excepción.
    const modulosPermitidos = getModulosPermitidosFromLocalStorage();
    const puedeVer = (modulo: string) => esAdmin || modulosPermitidos.includes(modulo);

    const puedeVerGestion = puedeVer('gestion');
    const puedeVerRRHH = puedeVer('rrhh');

    // Mantenimiento se decide submódulo por submódulo (Control de Accesos
    // asigna cada uno por separado); el encabezado "Mantenimiento" solo
    // aparece si al menos uno está permitido.
    const puedeVerEquipamiento = puedeVer('mantenimiento_equipamiento');
    const puedeVerTaller = puedeVer('mantenimiento_taller');
    const puedeVerAlmacenMod = puedeVer('mantenimiento_almacen');
    const puedeVerCostoOperativo = puedeVer('mantenimiento_costo_operativo');
    const puedeVerCompras = puedeVer('mantenimiento_compras');
    const puedeVerCombustibleMod = puedeVer('mantenimiento_combustible');
    const puedeVerMantenimiento =
        puedeVerEquipamiento || puedeVerTaller || puedeVerAlmacenMod || puedeVerCostoOperativo || puedeVerCompras || puedeVerCombustibleMod;

    const puedeVerControlObras = puedeVer('control_obras');
    const puedeVerSoporte = puedeVer('soporte');
    const puedeVerAdminViajes = puedeVer('admin_viajes');
    const puedeVerLogistica = puedeVer('admin_logistica');

    const model: AppMenuItem[] = [
        // ========== SECCIÓN HOME ==========
        // Visible para: TODOS
        {
            label: 'Home',
            items: [
                { label: 'Dashboard', icon: 'pi pi-fw pi-home', to: '/' },
                { label: 'Reloj Checador', icon: 'pi pi-fw pi-clock', to: '/uikit/checador' },
            ]
        },

        // ========== SECCIÓN AGENDA ==========
        // Visible para: TODOS. Cada quien ve solo su propia agenda (filtrado
        // por userid en agendaService.ts); Admin además puede ver la de
        // cualquier persona del personal y agendarle reuniones desde ahí.
        {
            label: 'Agenda',
            items: [
                { label: 'Mi Agenda', icon: 'pi pi-fw pi-calendar', to: '/agenda' },
            ]
        },

        // ========== SECCIÓN GESTION ==========
        // Visible según módulo 'gestion' asignado en Control de Accesos
        ...(puedeVerGestion ? [
            {
                label: 'Gestion',
                items: [
                    { label: 'Rastreo GPS', icon: 'pi pi-fw pi-map-marker', to: '/utilities/gps' },
                    { label: 'Notas', icon: 'pi pi-book', to: '/utilities/icons' },
                ]
            },
        ] : []),

        // ========== SECCIÓN RRHH ==========
        // Visible según módulo 'rrhh' asignado en Control de Accesos
        ...(puedeVerRRHH ? [
            {
                label: 'RRHH',
                items: [
                    { label: 'Empleados', icon: 'pi pi-users', to: '/uikit/RH' },
                    { label: 'Vacaciones', icon: 'pi pi-calendar', to: '/uikit/RH/Vacaciones' },
                    { label: 'Listado de Asistencia', icon: 'pi pi-fw pi-check-square', to: '/uikit/asistencia' },
                    { label: 'Zonas del Checador', icon: 'pi pi-fw pi-map', to: '/uikit/checador-zonas' },
                ]
            },
        ] : []),

        // ========== SECCIÓN MANTENIMIENTO ==========
        // Cada submódulo se asigna por separado desde Control de Accesos
        ...(puedeVerMantenimiento ? [
            {
                label: 'Mantenimiento',
                items: [
                    ...(puedeVerEquipamiento ? [{
                        label: 'Equipamiento',
                        icon: 'pi pi-fw pi-truck',
                        items: [
                            { label: 'Camiones', icon: 'pi pi-fw pi-truck', to: '/equipamiento/camiones' },
                            { label: 'Maquinaria', icon: 'pi pi-fw pi-cog', to: '/equipamiento/maquinaria' },
                        ]
                    }] : []),
                    ...(puedeVerTaller ? [{
                        label: 'Taller',
                        icon: 'pi pi-fw pi-wrench',
                        items: [
                            { label: 'Bitácora', icon: 'pi pi-fw pi-book', to: '/taller/bitacora' },
                            { label: 'Estatus General', icon: 'pi pi-fw pi-th-large', to: '/taller/estatus' },
                            { label: 'Rendimiento', icon: 'pi pi-fw pi-chart-line', to: '/taller/rendimiento' },
                        ]
                    }] : []),
                    ...(puedeVerAlmacenMod ? [{
                        label: 'Almacen',
                        icon: 'pi pi-fw pi-box',
                        items: [
                            { label: 'Inventario', icon: 'pi pi-fw pi-box', to: '/inventario' },
                            { label: 'Estadisticos', icon: 'pi pi-fw pi-chart-bar', to: '/inventario/estadisticos' },
                            { label: 'Validacion de Inventario', icon: 'pi pi-fw pi-check-square', to: '/inventario/validacion' },
                        ]
                    }] : []),
                    ...(puedeVerCostoOperativo ? [{
                        label: 'Costo Operativo',
                        icon: 'pi pi-fw pi-dollar',
                        items: [
                            { label: 'Costo Operativo de Unidad', icon: 'pi pi-fw pi-dollar', to: '/inventario/costo-operativo' },
                        ]
                    }] : []),
                    ...(puedeVerCompras ? [{
                        label: 'Compras',
                        icon: 'pi pi-fw pi-shopping-cart',
                        items: [
                            { label: 'Requisiciones de Compra', icon: 'pi pi-fw pi-shopping-cart', to: '/compras' },
                            { label: 'Caja Chica', icon: 'pi pi-fw pi-wallet', to: '/compras/caja-chica' },
                            { label: 'Proveedores', icon: 'pi pi-fw pi-users', to: '/compras/proveedores' },
                        ]
                    }] : []),
                    ...(puedeVerCombustibleMod ? [{
                        label: 'Combustible',
                        icon: 'pi pi-fw pi-bolt',
                        items: [
                            { label: 'Combustible', icon: 'pi pi-fw pi-bolt', to: '/combustible' },
                        ]
                    }] : []),
                ]
            },
        ] : []),

        // ========== SECCIÓN CONTROL DE OBRAS ==========
        // Visible según módulo 'control_obras' asignado en Control de Accesos
        ...(puedeVerControlObras ? [
            {
                label: 'Control de Obras',
                items: [
                    {
                        label: 'Infraestructura',
                        icon: 'pi pi-building',
                        items: [
                            {
                                label: 'Analisis de Precios Unitarios',
                                icon: 'pi pi-fw pi-box',
                                items: [
                                    { label: 'Catálogo de Insumos', icon: 'pi pi-fw pi-tags', to: '/control-obras/apu/insumos' },
                                    { label: 'Costo Horario de Maquinaria', icon: 'pi pi-fw pi-cog', to: '/control-obras/apu/maquinaria' },
                                    { label: 'Catálogo de Conceptos', icon: 'pi pi-fw pi-list', to: '/control-obras/apu/conceptos' },
                                    { label: 'Tarjetas de Precio Unitario', icon: 'pi pi-fw pi-id-card', to: '/control-obras/apu/tarjetas' },
                                    { label: 'Matriz de Precios Unitarios', icon: 'pi pi-fw pi-table', to: '/control-obras/apu/matriz' },
                                    { label: 'Explosión de Insumos', icon: 'pi pi-fw pi-sitemap', to: '/control-obras/apu/explosion-insumos' },
                                ]
                            },
                            {
                                label: 'Presupuesto',
                                icon: 'pi pi-fw pi-file-o',
                                items: [
                                    { label: 'Presupuestos', icon: 'pi pi-fw pi-file-o', to: '/control-obras/apu/presupuestos' },
                                    { label: 'Detalle por Presupuesto', icon: 'pi pi-fw pi-id-card', to: '/control-obras/apu/presupuestos/tarjetas' },
                                ]
                            },
                        ]
                    },
                ]
            },
        ] : []),

        // ========== SECCIÓN SOPORTE ==========
        // Visible según módulo 'soporte' asignado en Control de Accesos
        ...(puedeVerSoporte ? [
            {
                label: 'Soporte',
                items: [
                    { label: 'Reportar Incidencia', icon: 'pi pi-exclamation-circle', to: '/uikit/Soporte/Incidencias' },
                ]
            },
        ] : []),

        // ========== SECCIÓN ADMINISTRACIÓN ==========
        // Visible para: Admin (viajes y administración), Logistica (solo su sección)
        {
            label: 'Administración',
            items: [
                // Sub-sección Admin de Viajes - Solo para ADMIN
                ...(puedeVerAdminViajes ? [
                    {
                        label: 'Admin. de Viajes',
                        icon: 'pi pi-fw pi-truck',
                        items: [
                            {
                                label: 'Bitacora',
                                icon: 'pi pi-fw pi-truck',
                                items: [
                                    { label: 'Camion', icon: 'pi pi-fw pi-truck', to: '/uikit/formlayout' },
                                    { label: 'Maquinaria', icon: 'pi pi-fw pi-cog', to: '/uikit/formlayout/maquinaria' },
                                ]
                            },
                            { label: 'Resumen', icon: 'pi pi-fw pi-file', to: '/uikit/input' },
                            { label: 'Nomina', icon: 'pi pi-fw pi-user', to: '/uikit/floatlabel' },
                            { label: 'Facturación', icon: 'pi pi-fw pi-mobile', to: '/uikit/facturacion', class: 'rotated-icon' },
                            { label: 'Estimaciones', icon: 'pi pi-fw pi-calculator', to: '/uikit/formlayout/estimaciones' },
                        ]
                    },
                ] : []),

                // Sub-sección Admin de Logistica - Solo para LOGISTICA
                ...(puedeVerLogistica ? [
                    { 
                        label: 'Admin. de Logistica', 
                        icon: 'pi pi-fw pi-pencil', 
                        to: '/uikit/logistica' 
                    },
                ] : []),

                // NOTA: Las siguientes opciones están comentadas para referencia futura
                // { label: 'Table', icon: 'pi pi-fw pi-table', to: '/uikit/table' },
                // { label: 'List', icon: 'pi pi-fw pi-list', to: '/uikit/list' },
                // { label: 'Tree', icon: 'pi pi-fw pi-share-alt', to: '/uikit/tree' },
                // { label: 'Panel', icon: 'pi pi-fw pi-tablet', to: '/uikit/panel' },
                // { label: 'Overlay', icon: 'pi pi-fw pi-clone', to: '/uikit/overlay' },
                // { label: 'Media', icon: 'pi pi-fw pi-image', to: '/uikit/media' },
                // { label: 'Menu', icon: 'pi pi-fw pi-bars', to: '/uikit/menu', preventExact: true },
                // { label: 'Message', icon: 'pi pi-fw pi-comment', to: '/uikit/message' },
                // { label: 'File', icon: 'pi pi-fw pi-file', to: '/uikit/file' },
                // { label: 'Chart', icon: 'pi pi-fw pi-chart-bar', to: '/uikit/charts' },
                // { label: 'Misc', icon: 'pi pi-fw pi-circle', to: '/uikit/misc' }
            ]
        },

        // ========== SECCIÓN AUDITORÍA Y CONTROL DE ACCESOS ==========
        // Visible para: Admin únicamente. Fijo — no se delega por Control de
        // Accesos, porque ambas pantallas ya se protegen a nivel de RLS/API
        // con is_admin(), no con el sistema de módulos por usuario.
        ...(esAdmin ? [
            {
                label: 'Administración del Sistema',
                items: [
                    { label: 'Bitácora de cambios', icon: 'pi pi-fw pi-history', to: '/pages/crud/Auditoria' },
                    { label: 'Control de Accesos', icon: 'pi pi-fw pi-key', to: '/pages/crud/ControlAccesos' },
                ]
            },
        ] : []),

        // ========== OTRAS SECCIONES COMENTADAS ==========
        // {
        //     label: 'Utilities',
        //     items: [
        //         { label: 'PrimeIcons', icon: 'pi pi-fw pi-prime', to: '/utilities/icons' },
        //         { label: 'PrimeFlex', icon: 'pi pi-fw pi-desktop', url: 'https://primeflex.org/', target: '_blank' }
        //     ]
        // },
        // {
        //     label: 'Pages',
        //     icon: 'pi pi-fw pi-briefcase',
        //     to: '/pages',
        //     items: [
        //         {
        //             label: 'Landing',
        //             icon: 'pi pi-fw pi-globe',
        //             to: '/landing'
        //         },
        //         {
        //             label: 'Auth',
        //             icon: 'pi pi-fw pi-user',
        //             items: [
        //                 {
        //                     label: 'Login',
        //                     icon: 'pi pi-fw pi-sign-in',
        //                     to: '/auth/login'
        //                 },
        //                 {
        //                     label: 'Error',
        //                     icon: 'pi pi-fw pi-times-circle',
        //                     to: '/auth/error'
        //                 },
        //                 {
        //                     label: 'Access Denied',
        //                     icon: 'pi pi-fw pi-lock',
        //                     to: '/auth/access'
        //                 }
        //             ]
        //         },
        //         {
        //             label: 'Crud',
        //             icon: 'pi pi-fw pi-pencil',
        //             to: '/pages/crud'
        //         },
        //         {
        //             label: 'Timeline',
        //             icon: 'pi pi-fw pi-calendar',
        //             to: '/pages/timeline'
        //         },
        //         {
        //             label: 'Not Found',
        //             icon: 'pi pi-fw pi-exclamation-circle',
        //             to: '/pages/notfound'
        //         },
        //         {
        //             label: 'Empty',
        //             icon: 'pi pi-fw pi-circle-off',
        //             to: '/pages/empty'
        //         }
        //     ]
        // },
        // {
        //     label: 'Hierarchy',
        //     items: [
        //         {
        //             label: 'Submenu 1',
        //             icon: 'pi pi-fw pi-bookmark',
        //             items: [
        //                 {
        //                     label: 'Submenu 1.1',
        //                     icon: 'pi pi-fw pi-bookmark',
        //                     items: [
        //                         { label: 'Submenu 1.1.1', icon: 'pi pi-fw pi-bookmark' },
        //                         { label: 'Submenu 1.1.2', icon: 'pi pi-fw pi-bookmark' },
        //                         { label: 'Submenu 1.1.3', icon: 'pi pi-fw pi-bookmark' }
        //                     ]
        //                 },
        //                 {
        //                     label: 'Submenu 1.2',
        //                     icon: 'pi pi-fw pi-bookmark',
        //                     items: [{ label: 'Submenu 1.2.1', icon: 'pi pi-fw pi-bookmark' }]
        //                 }
        //             ]
        //         },
        //         {
        //             label: 'Submenu 2',
        //             icon: 'pi pi-fw pi-bookmark',
        //             items: [
        //                 {
        //                     label: 'Submenu 2.1',
        //                     icon: 'pi pi-fw pi-bookmark',
        //                     items: [
        //                         { label: 'Submenu 2.1.1', icon: 'pi pi-fw pi-bookmark' },
        //                         { label: 'Submenu 2.1.2', icon: 'pi pi-fw pi-bookmark' }
        //                     ]
        //                 },
        //                 {
        //                     label: 'Submenu 2.2',
        //                     icon: 'pi pi-fw pi-bookmark',
        //                     items: [{ label: 'Submenu 2.2.1', icon: 'pi pi-fw pi-bookmark' }]
        //                 }
        //             ]
        //         }
        //     ]
        // },
        // {
        //     label: 'Get Started',
        //     items: [
        //         {
        //             label: 'Documentation',
        //             icon: 'pi pi-fw pi-question',
        //             to: '/documentation'
        //         },
        //         {
        //             label: 'Figma',
        //             url: 'https://www.dropbox.com/scl/fi/bhfwymnk8wu0g5530ceas/sakai-2023.fig?rlkey=u0c8n6xgn44db9t4zkd1brr3l&dl=0',
        //             icon: 'pi pi-fw pi-pencil',
        //             target: '_blank'
        //         },
        //         {
        //             label: 'View Source',
        //             icon: 'pi pi-fw pi-search',
        //             url: 'https://github.com/primefaces/sakai-react',
        //             target: '_blank'
        //         }
        //     ]
        // }
    ];

    return (
        <MenuProvider>
            <ul className="layout-menu">
                {model.map((item, i) => {
                    return !item?.seperator ? <AppMenuitem item={item} root={true} index={i} key={item.label} /> : <li className="menu-separator"></li>;
                })}

                {/* <Link href="https://blocks.primereact.org" target="_blank" style={{ cursor: 'pointer' }}>
                    <img alt="Prime Blocks" className="w-full mt-3" src={`/layout/images/banner-primeblocks${layoutConfig.colorScheme === 'light' ? '' : '-dark'}.png`} />
                </Link> */}
            </ul>
        </MenuProvider>
    );
};

export default AppMenu;