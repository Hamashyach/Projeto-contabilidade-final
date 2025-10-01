
const SUPABASE_URL = 'https://kubvqfjfgvwuqrtbdlvj.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt1YnZxZmpmZ3Z3dXFydGJkbHZqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkwMjE0NDgsImV4cCI6MjA3NDU5NzQ0OH0.aXAnxDJr0MfipEsIg1tnRDb6DCxFbDOVkwIT0rjXu50';

const { createClient } = supabase;
const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);