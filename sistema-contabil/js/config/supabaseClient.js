// Importa a biblioteca diretamente via URL (versão ES Module)
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

// SUAS CHAVES (Já coloquei as que você mandou)
const supabaseUrl = 'https://kubvqfjfgvwuqrtbdlvj.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt1YnZxZmpmZ3Z3dXFydGJkbHZqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkwMjE0NDgsImV4cCI6MjA3NDU5NzQ0OH0.aXAnxDJr0MfipEsIg1tnRDb6DCxFbDOVkwIT0rjXu50';

// Cria e EXPORTA a conexão para ser usada nos outros arquivos
export const supabase = createClient(supabaseUrl, supabaseKey);