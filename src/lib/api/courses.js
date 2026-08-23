/* ---------------------------------------------------------------------------
   Lib API · Campos reales
   Construido en /plan-eng-review de Approach B PR1 (19/23 ago 2026).
   --------------------------------------------------------------------------*/

import { supabase } from "../supabase";

/** Los campos reales del grupo — hoy 3 (La Valmuza, Zarapicos, Villamayor). */
export const listCourses = async () => {
  const { data, error } = await supabase.from("courses").select("id, name, location, holes_count").order("name");
  if (error) throw error;
  return data;
};

/** Los hoyos de un campo, en orden — par/índice de dificultad/metros. */
export const listCourseHoles = async (courseId) => {
  const { data, error } = await supabase
    .from("course_holes")
    .select("hole_number, par, stroke_index, meters")
    .eq("course_id", courseId)
    .order("hole_number");
  if (error) throw error;
  return data;
};
