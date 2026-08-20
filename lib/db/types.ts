export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          email: string | null;
          full_name: string | null;
          role: "teacher" | "admin";
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email?: string | null;
          full_name?: string | null;
          role?: "teacher" | "admin";
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          email?: string | null;
          full_name?: string | null;
          role?: "teacher" | "admin";
          updated_at?: string;
        };
        Relationships: [];
      };
      projects: {
        Row: {
          id: string;
          owner_id: string;
          rubric_id: string | null;
          title: string;
          description: string | null;
          source_url: string | null;
          notion_source: Json;
          status: "draft" | "active" | "archived";
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          owner_id: string;
          rubric_id?: string | null;
          title: string;
          description?: string | null;
          source_url?: string | null;
          notion_source?: Json;
          status?: "draft" | "active" | "archived";
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          rubric_id?: string | null;
          title?: string;
          description?: string | null;
          source_url?: string | null;
          notion_source?: Json;
          status?: "draft" | "active" | "archived";
          updated_at?: string;
        };
        Relationships: [];
      };
      rubrics: {
        Row: {
          id: string;
          owner_id: string;
          title: string;
          description: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          owner_id: string;
          title: string;
          description?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          title?: string;
          description?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      rubric_criteria: {
        Row: {
          id: string;
          rubric_id: string;
          label: string;
          description: string;
          max_score: number;
          sort_order: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          rubric_id: string;
          label: string;
          description: string;
          max_score?: number;
          sort_order?: number;
          created_at?: string;
        };
        Update: {
          label?: string;
          description?: string;
          max_score?: number;
          sort_order?: number;
        };
        Relationships: [];
      };
      comments: {
        Row: {
          id: string;
          project_id: string;
          student_name: string | null;
          content: string;
          metadata: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          project_id: string;
          student_name?: string | null;
          content: string;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          student_name?: string | null;
          content?: string;
          metadata?: Json;
          updated_at?: string;
        };
        Relationships: [];
      };
      evaluations: {
        Row: {
          id: string;
          project_id: string;
          comment_id: string;
          evaluator_id: string;
          model_name: string | null;
          total_score: number | null;
          feedback: string | null;
          raw_output: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          project_id: string;
          comment_id: string;
          evaluator_id: string;
          model_name?: string | null;
          total_score?: number | null;
          feedback?: string | null;
          raw_output?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          model_name?: string | null;
          total_score?: number | null;
          feedback?: string | null;
          raw_output?: Json;
          updated_at?: string;
        };
        Relationships: [];
      };
      evaluation_scores: {
        Row: {
          id: string;
          evaluation_id: string;
          criterion_id: string;
          score: number;
          rationale: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          evaluation_id: string;
          criterion_id: string;
          score: number;
          rationale?: string | null;
          created_at?: string;
        };
        Update: {
          score?: number;
          rationale?: string | null;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
