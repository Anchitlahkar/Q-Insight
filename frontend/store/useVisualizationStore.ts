import { create } from "zustand";
import { SimulationResult } from "@/lib/types";

interface VisualizationState {
  currentStep: number;
  steps: any[];
  visualizationResult: SimulationResult | null;
  isVisualizing: boolean;
  isPlaying: boolean;
  speedMs: number;
  modalOpen: boolean;
}

interface VisualizationActions {
  setCurrentStep: (step: number) => void;
  setSteps: (steps: any[]) => void;
  setVisualizationResult: (result: SimulationResult | null) => void;
  setIsVisualizing: (value: boolean) => void;
  setIsPlaying: (value: boolean) => void;
  setSpeedMs: (value: number) => void;
  setModalOpen: (value: boolean) => void;
  resetVisualization: () => void;
}

const initialState: VisualizationState = {
  currentStep: -1,
  steps: [],
  visualizationResult: null,
  isVisualizing: false,
  isPlaying: false,
  speedMs: 600,
  modalOpen: false,
};

export const useVisualizationStore = create<VisualizationState & VisualizationActions>((set) => ({
  ...initialState,
  setCurrentStep: (step) => set({ currentStep: step }),
  setSteps: (steps) => set({ steps }),
  setVisualizationResult: (result) => set({ visualizationResult: result }),
  setIsVisualizing: (value) => set({ isVisualizing: value }),
  setIsPlaying: (value) => set({ isPlaying: value }),
  setSpeedMs: (value) => set({ speedMs: value }),
  setModalOpen: (value) => set({ modalOpen: value }),
  resetVisualization: () => set({ ...initialState }),
}));
