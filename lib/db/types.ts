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
          assessment_spec: Json;
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
          assessment_spec?: Json;
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
          assessment_spec?: Json;
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
          auto_generated: boolean;
          generation_context: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          owner_id: string;
          title: string;
          description?: string | null;
          auto_generated?: boolean;
          generation_context?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          title?: string;
          description?: string | null;
          auto_generated?: boolean;
          generation_context?: Json;
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
          rubric_version: string | null;
          execution_id: string | null;
          evaluation_stage: "manual" | "trial" | "batch";
          review_status: "pending" | "kept" | "revised" | "held";
          feedforward: string | null;
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
          rubric_version?: string | null;
          execution_id?: string | null;
          evaluation_stage?: "manual" | "trial" | "batch";
          review_status?: "pending" | "kept" | "revised" | "held";
          feedforward?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          model_name?: string | null;
          total_score?: number | null;
          feedback?: string | null;
          raw_output?: Json;
          rubric_version?: string | null;
          execution_id?: string | null;
          evaluation_stage?: "manual" | "trial" | "batch";
          review_status?: "pending" | "kept" | "revised" | "held";
          feedforward?: string | null;
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
      questioning_lesson_connections: {
        Row: {
          id: string;
          lesson_code: string;
          teacher_label: string | null;
          lesson_title: string | null;
          gemini_model: string;
          gemini_api_key_ciphertext: string;
          notion_api_key_ciphertext: string;
          notion_prep_database_id: string;
          notion_result_database_id: string;
          chatbot_config: Json;
          student_chatbot_path: string;
          status: "active" | "archived";
          expires_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          lesson_code: string;
          teacher_label?: string | null;
          lesson_title?: string | null;
          gemini_model?: string;
          gemini_api_key_ciphertext: string;
          notion_api_key_ciphertext: string;
          notion_prep_database_id: string;
          notion_result_database_id: string;
          chatbot_config?: Json;
          student_chatbot_path?: string;
          status?: "active" | "archived";
          expires_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          lesson_code?: string;
          teacher_label?: string | null;
          lesson_title?: string | null;
          gemini_model?: string;
          gemini_api_key_ciphertext?: string;
          notion_api_key_ciphertext?: string;
          notion_prep_database_id?: string;
          notion_result_database_id?: string;
          chatbot_config?: Json;
          student_chatbot_path?: string;
          status?: "active" | "archived";
          expires_at?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      questioning_documents: {
        Row: {
          id: string;
          lesson_code: string | null;
          title: string;
          body_text: string;
          summary: string;
          target_grade: string | null;
          subject_unit: string | null;
          standard: string | null;
          teacher_memo: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          lesson_code?: string | null;
          title: string;
          body_text?: string;
          summary?: string;
          target_grade?: string | null;
          subject_unit?: string | null;
          standard?: string | null;
          teacher_memo?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          lesson_code?: string | null;
          title?: string;
          body_text?: string;
          summary?: string;
          target_grade?: string | null;
          subject_unit?: string | null;
          standard?: string | null;
          teacher_memo?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      questioning_thinking_cards: {
        Row: {
          id: string;
          document_id: string;
          card_type: string;
          title: string;
          summary: string;
          content: string;
          source_type: string;
          source_text: string;
          source_location: string;
          reasoning_type: string | null;
          confidence: number;
          knowledge_status: string;
          student_level: string | null;
          difficulty: number | null;
          keywords: string[];
          related_questions: string[];
          question_intent: string | null;
          related_card_ids: string[];
          external_source_url: string | null;
          external_source_title: string | null;
          external_source_organization: string | null;
          external_source_date: string | null;
          source_reliability: string | null;
          dialogue_trigger: string | null;
          dialogue_prompt: string | null;
          dialogue_goal: string | null;
          is_enabled: boolean;
          embedding_json: Json;
          embedding_model: string | null;
          parent_card_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          document_id: string;
          card_type: string;
          title: string;
          summary?: string;
          content?: string;
          source_type: string;
          source_text?: string;
          source_location?: string;
          reasoning_type?: string | null;
          confidence?: number;
          knowledge_status?: string;
          student_level?: string | null;
          difficulty?: number | null;
          keywords?: string[];
          related_questions?: string[];
          question_intent?: string | null;
          related_card_ids?: string[];
          external_source_url?: string | null;
          external_source_title?: string | null;
          external_source_organization?: string | null;
          external_source_date?: string | null;
          source_reliability?: string | null;
          dialogue_trigger?: string | null;
          dialogue_prompt?: string | null;
          dialogue_goal?: string | null;
          is_enabled?: boolean;
          embedding_json?: Json;
          embedding_model?: string | null;
          parent_card_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          card_type?: string;
          title?: string;
          summary?: string;
          content?: string;
          source_type?: string;
          source_text?: string;
          source_location?: string;
          reasoning_type?: string | null;
          confidence?: number;
          knowledge_status?: string;
          student_level?: string | null;
          difficulty?: number | null;
          keywords?: string[];
          related_questions?: string[];
          question_intent?: string | null;
          related_card_ids?: string[];
          external_source_url?: string | null;
          external_source_title?: string | null;
          external_source_organization?: string | null;
          external_source_date?: string | null;
          source_reliability?: string | null;
          dialogue_trigger?: string | null;
          dialogue_prompt?: string | null;
          dialogue_goal?: string | null;
          is_enabled?: boolean;
          embedding_json?: Json;
          embedding_model?: string | null;
          parent_card_id?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      questioning_card_relations: {
        Row: {
          id: string;
          from_card_id: string;
          to_card_id: string;
          relation_type: string;
          note: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          from_card_id: string;
          to_card_id: string;
          relation_type: string;
          note?: string;
          created_at?: string;
        };
        Update: {
          relation_type?: string;
          note?: string;
        };
        Relationships: [];
      };
      questioning_student_questions: {
        Row: {
          id: string;
          document_id: string | null;
          lesson_code: string | null;
          student_key: string | null;
          raw_question: string;
          normalized_question: string;
          question_intent: string | null;
          used_card_ids: string[];
          answer_text: string;
          answer_confidence: number | null;
          answerable: boolean | null;
          missing_information: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          document_id?: string | null;
          lesson_code?: string | null;
          student_key?: string | null;
          raw_question: string;
          normalized_question?: string;
          question_intent?: string | null;
          used_card_ids?: string[];
          answer_text?: string;
          answer_confidence?: number | null;
          answerable?: boolean | null;
          missing_information?: string | null;
          created_at?: string;
        };
        Update: {
          answer_text?: string;
          answer_confidence?: number | null;
          answerable?: boolean | null;
          missing_information?: string | null;
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
