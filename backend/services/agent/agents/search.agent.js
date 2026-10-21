import { searchTool } from "../config/tavily.js"

export const searchAgent = async (state) => {
    try {
        const results = await searchTool.invoke({
            query:state.prompt
        })
        console.log(results)
        return{
            ...state,
            searchResults:results,
            images:results.images
        }
    } catch (error) {
        return{
            ...state,
            searchResults:[],
            images:[]
        }
    }
}