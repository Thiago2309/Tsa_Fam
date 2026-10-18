'use client';
import React from 'react';
import { InputText } from 'primereact/inputtext';

interface InputLitrosProps {
    id?: string;
    value: number | null;
    onChange: (value: number | null) => void;
    className?: string;
    moneda?: boolean; // Muestra el valor como pesos (MXN), p. ej. para el importe
}

// Entrada tipo "cajero": el usuario solo escribe dígitos y los 2 últimos se toman como decimales.
// Ej: 12345 -> 123.45. Útil en celular, donde el teclado numérico no siempre permite el punto decimal.
const MAX_DIGITOS = 9;

const InputLitros = ({ id, value, onChange, className, moneda }: InputLitrosProps) => {
    const display = value != null ? value.toLocaleString('es-MX', moneda ? { style: 'currency', currency: 'MXN' } : { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '';

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const digitos = e.target.value.replace(/\D/g, '').replace(/^0+/, '').slice(0, MAX_DIGITOS);
        onChange(digitos ? Number(digitos) / 100 : null);
    };

    return (
        <>
            <InputText id={id} value={display} onChange={handleChange} inputMode="numeric" placeholder={moneda ? '$0.00' : '0.00'} autoComplete="off" className={`w-full ${className ?? ''}`} />
            <small className="block text-500 mt-1">Escribe solo números; los 2 últimos son decimales.</small>
        </>
    );
};

export default InputLitros;
