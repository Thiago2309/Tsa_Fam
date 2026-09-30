// Services/BD/userService.ts
import { supabase } from '../superbase.service';

const withTimeout = <T,>(promise: PromiseLike<T>, ms: number, mensaje: string): Promise<T> =>
    Promise.race([
        Promise.resolve(promise),
        new Promise<T>((_, reject) => setTimeout(() => reject(new Error(mensaje)), ms))
    ]);

export interface User {
    id: number | null;
    auth_id: string | null;
    nombre: string;
    apellido: string;
    ciudad: string;
    sueldo: number;
    email: string;
    pass?: string;
}

// Función para verificar si el usuario existe en la tabla 'user'
export const verificarUsuarioEnTabla = async (email: string) => {
    const { data, error } = await supabase
        .from('user')
        .select('id, auth_id')
        .eq('email', email)
        .maybeSingle();

    if (error) {
        console.error('Error verificando usuario en tabla:', error);
        return null;
    }

    return data;
};

// Función para asignar rol a un usuario existente
export const asignarRol = async (userId: number, roleId: number) => {
    // Verificar si ya tiene el rol
    const { data: existingRole } = await supabase
        .from('userroles')
        .select('id')
        .eq('userid', userId)
        .eq('roleid', roleId)
        .maybeSingle();

    if (existingRole) {
        console.log('El usuario ya tiene este rol asignado');
        return true;
    }

    // IMPORTANTE: No enviar el campo 'id', dejar que la base de datos lo genere
    const { error } = await supabase
        .from('userroles')
        .insert([{ 
            userid: userId, 
            roleid: roleId 
        }]); // ← Sin el campo 'id'

    if (error) {
        console.error('Error asignando rol:', error);
        return false;
    }

    console.log('Rol asignado correctamente');
    return true;
};

// Función mejorada de registro.
// La creación real de usuario (auth.admin.*) corre en el servidor vía /api/usuarios,
// que usa la key service_role. Esta función solo llama a esa API — nunca debe
// usar supabase.auth.admin.* directamente desde el navegador (esa key no debe
// llegar al cliente).
export const register = async (email: string, password: string, userData: Omit<User, 'id' | 'auth_id' | 'email'>, roleId?: number) => {
    try {
        // /api/usuarios exige que quien llama esté logueado y sea Admin (roleid 1).
        // Mandamos el token de la sesión actual para que el servidor lo valide.
        const { data: sessionData } = await supabase.auth.getSession();
        const accessToken = sessionData.session?.access_token;

        if (!accessToken) {
            console.error('No hay sesión activa para crear usuarios');
            return null;
        }

        const response = await fetch('/api/usuarios', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${accessToken}`
            },
            body: JSON.stringify({ email, password, userData, roleId })
        });

        const result = await response.json();

        if (!response.ok) {
            console.error('Error en registro:', result?.error);
            return null;
        }

        return { userId: result.userId, authId: result.authId };

    } catch (error) {
        console.error('Error en register:', error);
        return null;
    }
};

export const login = async (email: string, password: string) => {
    try {
        // 1. Buscar el usuario en la tabla 'user' por email (para obtener su auth_id y relación)
        const { data: userData, error: userError } = await supabase
            .from('user')
            .select('id, nombre, apellido, auth_id, activo')
            .eq('email', email)
            .maybeSingle();

        if (userError) {
            console.error('Error verificando usuario:', userError);
            throw new Error('Error al verificar el usuario');
        }

        if (!userData) {
            throw new Error('Usuario no encontrado');
        }

        // 1.5. Cuenta desactivada desde Control de Accesos (reversible, distinto
        // de operador.estatus que es un tema de nómina).
        if (userData.activo === false) {
            throw new Error('⚠️ Esta cuenta está desactivada. Contacte al administrador.');
        }

        // 2. Buscar el operador usando el nombre del usuario (asumiendo que coinciden)
        const { data: operador, error: operadorError } = await supabase
            .from('operador')
            .select('estatus, id, nombre')
            .eq('nombre', userData.nombre) // Buscar por nombre (o por id si tienes relación)
            .maybeSingle();

        if (operadorError) {
            console.error('Error verificando operador:', operadorError);
            throw new Error('Error al verificar el estado del operador');
        }

        // 3. Si el operador existe y está desactivado, NO permite login
        if (operador && !operador.estatus) {
            throw new Error('⚠️ Usuario desactivado. Contacte al administrador.');
        }

        // 4. Si está activo o no existe (operador sin acceso), proceder con el login normal
        // El SDK de Supabase serializa TODAS sus llamadas de auth (login, refresh, getSession...)
        // detrás de un mismo candado interno que espera indefinidamente. Si el endpoint de Auth
        // se pone lento (se ha visto tardar varios minutos), signInWithPassword se queda colgado
        // sin avisar. Este timeout evita que el usuario se quede viendo un spinner para siempre;
        // si se dispara, hay que recargar la página antes de reintentar (el candado interno sigue
        // ocupado por el intento anterior hasta que ese request realmente termine o se recargue).
        const { data, error } = await withTimeout(
            supabase.auth.signInWithPassword({ email, password }),
            15000,
            'El servidor de autenticación está tardando demasiado en responder. Recarga la página e intenta de nuevo.'
        );

        if (error || !data.user) {
            console.error('Error en autenticación:', error?.message);
            throw error || new Error('No se pudo autenticar al usuario');
        }

        // 5. Verificar que el auth_id coincida con el usuario en la tabla 'user'
        if (data.user.id !== userData.auth_id) {
            console.warn('⚠️ El auth_id no coincide, actualizando...');
            // Actualizar auth_id en la tabla 'user'
            await supabase
                .from('user')
                .update({ auth_id: data.user.id })
                .eq('id', userData.id);
        }

        // 6. Guardar datos de sesión
        const authId = data.user.id;
        sessionStorage.setItem('authId', authId);

        const userId = userData.id;
        sessionStorage.setItem('userId', userId.toString());

        // 7. Obtener el rol del usuario
        const { data: userRole, error: roleError } = await supabase
            .from('userroles')
            .select('roleid')
            .eq('userid', userId)
            .maybeSingle();

        if (roleError) {
            console.error('Error obteniendo rol:', roleError.message);
            // Continuar aunque no tenga rol
        }

        const roleid = userRole?.roleid || null;

        // 8. Obtener los módulos del menú que puede ver (Control de Accesos).
        // Admin no depende de esto (ve todo por bypass en AppMenu.tsx), pero se
        // guarda igual por si en algún momento deja de ser Admin.
        const { data: permisos, error: permisosError } = await supabase
            .from('permisos_modulo')
            .select('modulo')
            .eq('userid', userId);

        if (permisosError) {
            console.error('Error obteniendo módulos permitidos:', permisosError.message);
        }

        const modulos = (permisos || []).map((p) => p.modulo);

        localStorage.setItem('userData', JSON.stringify({
            userId,
            roleid,
            nombre: userData.nombre,
            apellido: userData.apellido,
            modulos
        }));

        // Guardar estatus del operador para verificaciones rápidas
        localStorage.setItem('userEstatus', operador?.estatus ? 'activo' : 'inactivo');

        console.log(`✅ Login exitoso: ${email}`);
        return data.user;

    } catch (error: any) {
        console.error('Error en login:', error);
        throw new Error(error.message || 'Error al iniciar sesión');
    }
};

export const fetchUserData = async (authId: string) => {
    const { data, error } = await supabase
        .from('user')
        .select('*')
        .eq('auth_id', authId)
        .maybeSingle();

    return error ? null : data;
};

export const getsession = async () => {
    const { data, error } = await supabase.auth.getSession();
    if (error) {
        console.error("Error al obtener la sesión:", error);
        return null;
    }
    return data.session;
};

export const getUserRoleIdFromLocalStorage = (): number | null => {
    const userData = localStorage.getItem('userData');
    return userData ? JSON.parse(userData).roleid as number : null;
};

export const getUserIdFromLocalStorage = (): number | null => {
    const userData = localStorage.getItem('userData');
    if (!userData) return null;
    const { userId } = JSON.parse(userData);
    return typeof userId === 'number' ? userId : null;
};

export const getUserNombreFromLocalStorage = (): string | null => {
    const userData = localStorage.getItem('userData');
    if (!userData) return null;
    const { nombre, apellido } = JSON.parse(userData);
    const nombreCompleto = [nombre, apellido].filter(Boolean).join(' ').trim();
    return nombreCompleto || null;
};

// Módulos del menú que este usuario puede ver, asignados desde Control de
// Accesos. No incluye 'home' (siempre visible) ni 'auditoria'/'control de
// accesos' (fijos solo para Admin) — ver Services/BD/permisosService.ts.
export const getModulosPermitidosFromLocalStorage = (): string[] => {
    const userData = localStorage.getItem('userData');
    if (!userData) return [];
    const { modulos } = JSON.parse(userData);
    return Array.isArray(modulos) ? modulos : [];
};